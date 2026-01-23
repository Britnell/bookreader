/**
 * Convert ArrayBuffer to string
 */
export function arrayBufferToString(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder("utf-8");
  const view = new Uint8Array(buffer);
  return decoder.decode(view);
}

/**
 * Parse XML string to DOM Document using native DOMParser
 */
export function parseXML(xmlString: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");

  // Check for parsing errors
  if (doc.documentElement.nodeName === "parsererror") {
    throw new Error("XML parsing error: " + doc.documentElement.textContent);
  }

  return doc;
}

/**
 * Serialize DOM Document back to XML string
 */
export function serializeXML(doc: Document): string {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}

/**
 * Read and parse XML from EPUB ArrayBuffer
 */
export async function readXMLFromEPUB(buffer: ArrayBuffer): Promise<Document> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  await zip.loadAsync(buffer);

  // Get the first .xhtml or .html file from the EPUB
  let xmlFile: any = null;
  zip.forEach((relativePath: string, file: any) => {
    // console.log(relativePath, file);

    if (
      (relativePath.endsWith(".xhtml") ||
        relativePath.endsWith(".html") ||
        relativePath.endsWith(".xml")) &&
      !xmlFile
    ) {
      xmlFile = file;
    }
  });

  if (!xmlFile) {
    throw new Error("No XML content found in EPUB");
  }

  const xmlString = await xmlFile.async("text");
  return parseXML(xmlString);
}
