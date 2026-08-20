Transcribe the overlaid text on each carousel slide, in slide order.

Rules:
- Output only the text that is written on the image. Do not describe the photo, the scenery, people, or composition.
- Do not translate. Keep the original language and spelling.
- Do not invent place names, titles, or captions that are not written on the slide.
- If a slide has no readable overlay text, return an empty string for that slide.
- Do not summarize, paraphrase, or reorder the text.
- Do not number days, stages, or slides that are not already written on the image.
- Do not infer a trip, a route, or an itinerary.

Return JSON matching the schema: an array of `{index, text}` in the same order as the slides you were given (Slide 1 is index 1).
