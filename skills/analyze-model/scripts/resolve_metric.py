import dataclasses
import importlib
import statistics

TEXT = "text"
AUDIO = "audio"
IMAGE = "image"
VIDEO = "video"
FRAME_BATCH_SIZE = 16
EVALUATE_URL = "https://huggingface.co/spaces/evaluate-metric/{name}"
AURALOSS_URL = "https://github.com/csteinmetz1/auraloss"
STRUCTURAL_SIMILARITY_URL = (
    "https://lightning.ai/docs/torchmetrics/stable/image/"
    "structural_similarity.html"
)


class MetricError(Exception):
    pass


def load_normalizer(reference):
    if not reference:
        return lambda text: text

    if ":" not in reference:
        raise MetricError(
            f"normalizer takes module:attribute, not {reference!r}"
        )

    module_name, attribute = reference.split(":", 1)
    normalizer = getattr(importlib.import_module(module_name), attribute)

    return normalizer() if isinstance(normalizer, type) else normalizer


def load_evaluate_scorer(metric_config):
    import evaluate

    name = metric_config["name"]
    loaded = evaluate.load(name)
    normalize = load_normalizer(metric_config.get("normalizer"))
    key = metric_key(metric_config)
    nested = METRICS[name].nested_references
    scale = metric_config.get("scale", 1)

    def score(predictions, references):
        normalized_references = [normalize(text) for text in references]
        computed = loaded.compute(
            predictions=[normalize(text) for text in predictions],
            references=(
                [[text] for text in normalized_references]
                if nested
                else normalized_references
            ),
        )
        value = computed[key] if key else computed

        return float(value) * scale

    return score


def media_scorer(distance, scale):
    def score(predictions, references):
        return (
            statistics.fmean(
                distance(prediction, reference)
                for prediction, reference in zip(
                    predictions, references, strict=True
                )
            )
            * scale
        )

    return score


def load_multi_resolution_stft_scorer(metric_config):
    import auraloss
    import soundfile
    import torch

    loss = auraloss.freq.MultiResolutionSTFTLoss()

    def read_waveform(path):
        samples, sample_rate = soundfile.read(
            str(path), dtype="float32", always_2d=True
        )

        return torch.from_numpy(samples.T.copy()), sample_rate

    def distance(left_path, right_path):
        left, left_rate = read_waveform(left_path)
        right, right_rate = read_waveform(right_path)

        if left_rate != right_rate:
            raise MetricError(
                f"{left_path.name} is {left_rate} Hz and {right_path.name} "
                f"is {right_rate} Hz; a distance between different sample "
                "rates would measure the resampler"
            )

        if left.shape[0] != right.shape[0]:
            raise MetricError(
                f"{left_path.name} has {left.shape[0]} channels and "
                f"{right_path.name} has {right.shape[0]}"
            )

        length = max(left.shape[1], right.shape[1])
        left = torch.nn.functional.pad(left, (0, length - left.shape[1]))
        right = torch.nn.functional.pad(right, (0, length - right.shape[1]))

        with torch.no_grad():
            return float(loss(left.unsqueeze(0), right.unsqueeze(0)))

    return media_scorer(distance, metric_config.get("scale", 1))


def load_structural_dissimilarity_scorer(metric_config):
    import av
    import numpy
    import torch
    from PIL import Image, UnidentifiedImageError
    from torchmetrics.functional.image import (
        structural_similarity_index_measure,
    )

    def read_frames(path):
        try:
            with Image.open(path) as image:
                arrays = [numpy.asarray(image.convert("RGB"))]
        except UnidentifiedImageError:
            with av.open(str(path)) as container:
                arrays = [
                    frame.to_ndarray(format="rgb24")
                    for frame in container.decode(video=0)
                ]

        return numpy.stack(arrays)

    def as_tensor(frames):
        return torch.from_numpy(frames).permute(0, 3, 1, 2).float() / 255

    def distance(left_path, right_path):
        left = read_frames(left_path)
        right = read_frames(right_path)

        if left.shape != right.shape:
            raise MetricError(
                f"{left_path.name} holds frames of shape {left.shape} and "
                f"{right_path.name} of shape {right.shape}; a distance "
                "between different sizes would measure the resize"
            )

        similarities = []

        for start in range(0, len(left), FRAME_BATCH_SIZE):
            end = start + FRAME_BATCH_SIZE
            similarities += structural_similarity_index_measure(
                as_tensor(left[start:end]),
                as_tensor(right[start:end]),
                data_range=1.0,
                reduction="none",
            ).tolist()

        return (1 - statistics.fmean(similarities)) / 2

    return media_scorer(distance, metric_config.get("scale", 1))


@dataclasses.dataclass(frozen=True)
class Metric:
    packages: tuple
    load: object
    url: str
    keys: tuple = ()
    nested_references: bool = False


def text_metric(packages, keys=(), nested_references=False):
    return Metric(
        packages=("evaluate", *packages),
        load=load_evaluate_scorer,
        url=EVALUATE_URL,
        keys=keys,
        nested_references=nested_references,
    )


METRICS = {
    "wer": text_metric(("jiwer",)),
    "cer": text_metric(("jiwer",)),
    "ter": text_metric(
        ("sacrebleu",), keys=("score",), nested_references=True
    ),
    "bleu": text_metric((), keys=("bleu",)),
    "sacrebleu": text_metric(
        ("sacrebleu",), keys=("score",), nested_references=True
    ),
    "chrf": text_metric(
        ("sacrebleu",), keys=("score",), nested_references=True
    ),
    "rouge": text_metric(
        ("rouge_score", "nltk", "absl-py"),
        keys=("rouge1", "rouge2", "rougeL", "rougeLsum"),
    ),
    "meteor": text_metric(("nltk",), keys=("meteor",)),
    "exact_match": text_metric((), keys=("exact_match",)),
    "multi_resolution_stft": Metric(
        packages=("auraloss", "torch", "soundfile"),
        load=load_multi_resolution_stft_scorer,
        url=AURALOSS_URL,
    ),
    "structural_dissimilarity": Metric(
        packages=("torchmetrics", "torch", "pillow", "av"),
        load=load_structural_dissimilarity_scorer,
        url=STRUCTURAL_SIMILARITY_URL,
    ),
}
OUTPUT_KINDS = (TEXT, AUDIO, IMAGE, VIDEO)
PUBLISHED_SCORE_METRICS = {
    TEXT: (
        "wer",
        "cer",
        "ter",
        "bleu",
        "sacrebleu",
        "chrf",
        "rouge",
        "meteor",
        "exact_match",
    ),
}
MACHINE_DISTANCE_METRICS = {
    TEXT: "cer",
    AUDIO: "multi_resolution_stft",
    IMAGE: "structural_dissimilarity",
    VIDEO: "structural_dissimilarity",
}


def metric_key(metric_config):
    keys = METRICS[metric_config["name"]].keys

    if len(keys) == 1:
        return metric_config.get("key") or keys[0]

    return metric_config.get("key")


def metric_url(metric_config):
    if metric_config is None:
        return None

    return METRICS[metric_config["name"]].url.format(
        name=metric_config["name"]
    )


def load_scorer(metric_config):
    return METRICS[metric_config["name"]].load(metric_config)
