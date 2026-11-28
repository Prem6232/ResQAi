from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Dict, Tuple

import numpy as np
import onnxruntime as ort
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from onnxruntime.quantization.shape_inference import quant_pre_process
from transformers import AutoTokenizer

from model import MultilingualDuplicateEncoder, load_matcher_config


def cosine_sim(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return np.sum(a * b, axis=-1)


def run_ort_embeddings(session: ort.InferenceSession, input_ids: np.ndarray, attention_mask: np.ndarray) -> np.ndarray:
    outputs = session.run(
        None,
        {
            "input_ids": input_ids.astype(np.int64),
            "attention_mask": attention_mask.astype(np.int64),
        },
    )
    return outputs[0]


def cleanup_temp_onnx_files(onnx_dir: Path) -> None:
    """Remove intermediate shape-inference / quantization temp files if left behind."""
    for name in ("model_prep.onnx", "sym_shape_infer_temp.onnx"):
        p = onnx_dir / name
        if p.exists():
            p.unlink()
        p_root = Path(name)
        if p_root.exists():
            p_root.unlink()


def verify_parity(
    torch_model: MultilingualDuplicateEncoder,
    tokenizer: AutoTokenizer,
    fp32_path: Path,
    int8_path: Path,
    max_length: int,
    query_prefix: str,
) -> Dict[str, float]:
    sample_texts = [
        f"{query_prefix}Chuna Bhatti square pe e-rickshaw mein battery blast hoke aag fail gayi",
        f"{query_prefix}E-rickshaw battery explosion fire and dense smoke at Chuna Bhatti crossing",
        f"{query_prefix}Chuna Bhatti square par bike phisal gayi rider ke pair mein chot lagi",
    ]
    enc = tokenizer(
        sample_texts,
        padding="max_length",
        truncation=True,
        max_length=max_length,
        return_tensors="pt",
    )

    with torch.no_grad():
        torch_emb = torch_model(enc["input_ids"], enc["attention_mask"]).numpy()

    fp32_sess = ort.InferenceSession(str(fp32_path), providers=["CPUExecutionProvider"])
    int8_sess = ort.InferenceSession(str(int8_path), providers=["CPUExecutionProvider"])

    ids_np = enc["input_ids"].numpy()
    mask_np = enc["attention_mask"].numpy()
    fp32_emb = run_ort_embeddings(fp32_sess, ids_np, mask_np)
    int8_emb = run_ort_embeddings(int8_sess, ids_np, mask_np)

    return {
        "fp32_max_abs_diff": float(np.max(np.abs(torch_emb - fp32_emb))),
        "int8_max_abs_diff": float(np.max(np.abs(torch_emb - int8_emb))),
        "torch_pos_sim": float(cosine_sim(torch_emb[0], torch_emb[1])),
        "torch_neg_sim": float(cosine_sim(torch_emb[0], torch_emb[2])),
        "fp32_pos_sim": float(cosine_sim(fp32_emb[0], fp32_emb[1])),
        "fp32_neg_sim": float(cosine_sim(fp32_emb[0], fp32_emb[2])),
        "int8_pos_sim": float(cosine_sim(int8_emb[0], int8_emb[1])),
        "int8_neg_sim": float(cosine_sim(int8_emb[0], int8_emb[2])),
    }


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    cfg_path = base_dir / "configs" / "matcher_config.json"
    cfg = load_matcher_config(cfg_path)

    parser = argparse.ArgumentParser(description="Export trained MultilingualDuplicateEncoder to FP32 and INT8 ONNX")
    parser.add_argument("--checkpoint-dir", type=Path, default=base_dir / "artifacts" / "best_checkpoint")
    parser.add_argument("--onnx-dir", type=Path, default=base_dir / "artifacts" / "onnx")
    parser.add_argument("--opset", type=int, default=17)
    args = parser.parse_args()

    args.onnx_dir.mkdir(parents=True, exist_ok=True)
    fp32_path = args.onnx_dir / "model_fp32.onnx"
    int8_path = args.onnx_dir / "model_int8.onnx"
    prep_path = args.onnx_dir / "model_prep.onnx"

    max_length = int(cfg["max_length"])
    query_prefix = str(cfg["query_prefix"])

    print(f"Loading PyTorch checkpoint from {args.checkpoint_dir}...")
    model = MultilingualDuplicateEncoder.load_checkpoint(args.checkpoint_dir, map_location="cpu")
    model.eval()
    tokenizer = AutoTokenizer.from_pretrained(args.checkpoint_dir)

    sample = tokenizer(
        f"{query_prefix}MP Nagar transformer mein aag aur dhuwa nikal raha hai",
        return_tensors="pt",
        padding="max_length",
        truncation=True,
        max_length=max_length,
    )

    torch.onnx.export(
        model,
        (sample["input_ids"], sample["attention_mask"]),
        str(fp32_path),
        export_params=True,
        opset_version=args.opset,
        do_constant_folding=True,
        dynamo=False,
        input_names=["input_ids", "attention_mask"],
        output_names=["embeddings"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "seq_len"},
            "attention_mask": {0: "batch_size", 1: "seq_len"},
            "embeddings": {0: "batch_size"},
        },
    )
    print(f"Exported FP32 ONNX: {fp32_path} ({fp32_path.stat().st_size / 1e6:.2f} MB)")

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
    cleanup_temp_onnx_files(args.onnx_dir)
    print(f"Quantized INT8 ONNX: {int8_path} ({int8_path.stat().st_size / 1e6:.2f} MB)")

    # Make onnx_dir standalone
    tokenizer.save_pretrained(args.onnx_dir)
    shutil.copy2(cfg_path, args.onnx_dir / "matcher_config.json")
    for fname in ("model_meta.json",):
        src = args.checkpoint_dir / fname
        if src.exists():
            shutil.copy2(src, args.onnx_dir / fname)

    parity = verify_parity(model, tokenizer, fp32_path, int8_path, max_length=max_length, query_prefix=query_prefix)
    print("ONNX parity check:", json.dumps(parity, indent=2))


if __name__ == "__main__":
    main()
