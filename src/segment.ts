export interface TextSegment {
  text: string;
  wordLike: boolean;
}

const isWhitespace = (text: string): boolean => /^\s+$/u.test(text);

/** Keep exactly one mutable tail segment so chunks may split words or emoji. */
export function splitStableTail(
  input: string,
  segmenter: Intl.Segmenter,
): {
  stable: TextSegment[];
  tail: TextSegment | null;
} {
  if (input.length === 0) return { stable: [], tail: null };

  const segments = Array.from(segmenter.segment(input), (part) => ({
    text: part.segment,
    wordLike: part.isWordLike === true || !isWhitespace(part.segment),
  }));
  const tail = segments.pop() ?? null;
  return { stable: segments, tail };
}
