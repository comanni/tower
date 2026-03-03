/**
 * Extract plain text from message content.
 * Content can be a plain string or a JSON array of content blocks like [{type:"text", text:"..."}].
 */
export function extractTextFromContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join(' ');
    }
    return content;
  } catch {
    return content;
  }
}
