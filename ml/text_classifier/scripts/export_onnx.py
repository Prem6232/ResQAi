from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from onnxruntime.quantization.shape_inference import quant_pre_process
from transformers import AutoTokenizer

from model import IndianEmergencyClassifier


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Export trained Indian Emergency Classifier to FP32 and INT8 ONNX")
    parser.add_argument("--checkpoint-dir", type=Path, default=base_dir / "artifacts" / "best_checkpoint")
    parser.add_argument("--onnx-dir", type=Path, default=base_dir / "artifacts" / "onnx")
    parser.add_argument("--opset", type=int, default=17)
    args = parser.parse_args()

    args.onnx_dir.mkdir(parents=True, exist_ok=True)
    fp32_path = args.onnx_dir / "model_fp32.onnx"
    int8_path = args.onnx_dir / "model_int8.onnx"

    print(f"Loading PyTorch checkpoint from {args.checkpoint_dir}...")
    model = IndianEmergencyClassifier.load_checkpoint(args.checkpoint_dir, map_location="cpu")
    model.eval()
    tokenizer = AutoTokenizer.from_pretrained(args.checkpoint_dir)

    sample = tokenizer(
        "MP Nagar transformer mein aag aur dhuwa nikal raha hai",
        return_tensors="pt",
        padding="max_length",
        truncation=True,
        max_length=128,
    )

    with torch.no_grad():
        torch_cat, torch_urg = model(sample["input_ids"], sample["attention_mask"])

    torch.onnx.export(
        model,
        (sample["input_ids"], sample["attention_mask"]),
        str(fp32_path),
        export_params=True,
        opset_version=args.opset,
        do_constant_folding=True,
        dynamo=False,
        input_names=["input_ids", "attention_mask"],
        output_names=["category_logits", "urgency_logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "seq_len"},
            "attention_mask": {0: "batch_size", 1: "seq_len"},
            "category_logits": {0: "batch_size"},
            "urgency_logits": {0: "batch_size"},
        },
    )
    print(f"Exported FP32 ONNX: {fp32_path} ({fp32_path.stat().st_size / 1e6:.1f} MB)")

    prep_path = args.onnx_dir / "model_prep.onnx"
    quant_pre_process(
        str(fp32_path),
        str(prep_path),
        skip_symbolic_shape=True,
        skip_onnx_shape=True,
    )
    quantize_dynamic(
        model_input=str(prep_path),
        model_output=str(int8_path),
        weight_type=QuantType.QInt8,
        per_channel=True,
        op_types_to_quantize=["MatMul"],
        extra_options={"MatMulConstBOnly": True},
    )
    if prep_path.exists():
        prep_path.unlink()
    print(f"Quantized INT8 ONNX: {int8_path} ({int8_path.stat().st_size / 1e6:.1f} MB)")

    # Copy tokenizer + metadata bundle into onnx_dir so it's 100% standalone
    tokenizer.save_pretrained(args.onnx_dir)
    for fname in ("labels.json", "model_meta.json"):
        src = args.checkpoint_dir / fname
        if src.exists():
            shutil.copy2(src, args.onnx_dir / fname)

    # Verify ONNX INT8 outputs match PyTorch closely
    sess = ort.InferenceSession(str(int8_path), providers=["CPUExecutionProvider"])
    ort_cat, ort_urg = sess.run(
        None,
        {
            "input_ids": sample["input_ids"].numpy(),
            "attention_mask": sample["attention_mask"].numpy(),
        },
    )
    cat_diff = float(np.max(np.abs(torch_cat.numpy() - ort_cat)))
    urg_diff = float(np.max(np.abs(torch_urg.numpy() - ort_urg)))
    cat_match = int(np.argmax(torch_cat.numpy())) == int(np.argmax(ort_cat))
    urg_match = int(np.argmax(torch_urg.numpy())) == int(np.argmax(ort_urg))

    parity = {
        "fp32_size_mb": round(fp32_path.stat().st_size / 1e6, 2),
        "int8_size_mb": round(int8_path.stat().st_size / 1e6, 2),
        "sample_max_cat_logit_diff": round(cat_diff, 4),
        "sample_max_urg_logit_diff": round(urg_diff, 4),
        "sample_cat_top1_match": cat_match,
        "sample_urg_top1_match": urg_match,
    }
    with open(args.onnx_dir / "export_summary.json", "w", encoding="utf-8") as f:
        json.dump(parity, f, indent=2)
    print("ONNX export parity:", parity)


if __name__ == "__main__":
    main()
