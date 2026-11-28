from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

from model import (
    FCOSOnnxWrapper,
    build_fcos_anchors,
    build_fcos_model,
    load_vision_config,
    postprocess_fcos_outputs,
)


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    cfg_path = base_dir / "configs" / "vision_config.json"
    cfg = load_vision_config(cfg_path)
    img_size = int(cfg["image_size"])

    parser = argparse.ArgumentParser(description="Export trained FCOS-ResNet50-FPN detector to standalone ONNX")
    parser.add_argument("--checkpoint-dir", type=Path, default=base_dir / "artifacts" / "best_checkpoint")
    parser.add_argument("--onnx-dir", type=Path, default=base_dir / "artifacts" / "onnx")
    parser.add_argument("--opset", type=int, default=17)
    args = parser.parse_args()

    args.onnx_dir.mkdir(parents=True, exist_ok=True)
    fp32_path = args.onnx_dir / "model_fp32.onnx"

    print(f"Loading FCOS checkpoint from {args.checkpoint_dir}...")
    model = build_fcos_model(img_size=img_size, trainable_backbone_layers=3, pretrained=False)
    state = torch.load(args.checkpoint_dir / "fcos_weights.pt", map_location="cpu", weights_only=True)
    model.load_state_dict(state)
    model.eval()

    wrapper = FCOSOnnxWrapper(model).eval()
    rng = np.random.default_rng(42)
    sample_np = rng.uniform(0.0, 1.0, size=(1, 3, img_size, img_size)).astype(np.float32)
    sample_pt = torch.from_numpy(sample_np)

    with torch.no_grad():
        pt_cls, pt_box, pt_ctr = wrapper(sample_pt)
        tv_out = model([sample_pt[0]])[0]

    torch.onnx.export(
        wrapper,
        (sample_pt,),
        str(fp32_path),
        export_params=True,
        opset_version=args.opset,
        do_constant_folding=True,
        dynamo=False,
        input_names=["pixel_values"],
        output_names=["cls_logits", "bbox_regression", "bbox_ctrness"],
        dynamic_axes={
            "pixel_values": {0: "batch_size"},
            "cls_logits": {0: "batch_size"},
            "bbox_regression": {0: "batch_size"},
            "bbox_ctrness": {0: "batch_size"},
        },
    )
    print(f"Exported FP32 ONNX: {fp32_path} ({fp32_path.stat().st_size / 1e6:.2f} MB)")

    shutil.copy2(cfg_path, args.onnx_dir / "vision_config.json")
    meta_src = args.checkpoint_dir / "model_meta.json"
    if meta_src.exists():
        shutil.copy2(meta_src, args.onnx_dir / "model_meta.json")

    sess = ort.InferenceSession(str(fp32_path), providers=["CPUExecutionProvider"])
    ort_cls, ort_box, ort_ctr = sess.run(None, {"pixel_values": sample_np})

    anchors = build_fcos_anchors(img_size)
    ort_dets = postprocess_fcos_outputs(
        ort_cls[0],
        ort_box[0],
        ort_ctr[0],
        anchors,
        img_size=img_size,
        score_threshold=0.05,
    )
    parity = {
        "fp32_max_cls_diff": float(np.max(np.abs(pt_cls.numpy() - ort_cls))),
        "fp32_max_box_diff": float(np.max(np.abs(pt_box.numpy() - ort_box))),
        "fp32_max_ctr_diff": float(np.max(np.abs(pt_ctr.numpy() - ort_ctr))),
        "tv_top_score": float(tv_out["scores"].max().item()) if len(tv_out["scores"]) else 0.0,
        "ort_top_score": float(ort_dets[0]["score"]) if ort_dets else 0.0,
    }
    print("ONNX parity check:", json.dumps(parity, indent=2))


if __name__ == "__main__":
    main()
