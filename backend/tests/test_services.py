from typing import List

from app.core.types import Segment, TranscriptionChunk
from app.services.segmentation import SegmentationService
from app.services.summarization import SummarizationService
from app.services.keywords import KeywordsService
from app.services.search import SearchService


def test_segmentation_service_basic():
    svc = SegmentationService()
    chunks = [
        TranscriptionChunk(text="Hello world.", start=0.0, end=1.0),
        TranscriptionChunk(text="This is a test of segmentation.", start=1.0, end=2.0),
        TranscriptionChunk(text="We continue with more text.", start=2.0, end=3.0),
    ]
    segments = svc.segment_transcript(chunks)
    assert isinstance(segments, list)
    assert len(segments) >= 1
    assert isinstance(segments[0], Segment)


def test_summarization_service_basic():
    svc = SummarizationService(mode="extractive")
    text = "This is a sentence. This is another sentence. Yet another sentence to summarize."
    summary = svc.summarize_segment(text)
    assert isinstance(summary, str)
    full = svc.summarize_full_transcript([Segment(1, 0.0, 1.0, text)])
    assert isinstance(full, str)


def test_keywords_service_basic():
    svc = KeywordsService()
    text = "This podcast discusses testing and quality assurance. Testing improves quality."
    keywords = svc.extract_keywords(text)
    assert isinstance(keywords, list)


def test_search_service_basic():
    s = SearchService()
    segments = [
        Segment(1, 0.0, 1.0, "First segment text about dogs."),
        Segment(2, 1.0, 2.0, "Second segment text about cats."),
    ]
    s.create_index(segments)
    results = s.search("dogs and cats", top_k=2)
    assert isinstance(results, list)
    if results:
        assert results[0].score > 0
