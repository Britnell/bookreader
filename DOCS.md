# Epub.js API Notes (Parse-only)

To use Epub.js without the iframe renderer (useful for custom TTS and highlighting):

## Initialization
```javascript
const book = ePub(arrayBuffer);
await book.ready; // Wait for spine and metadata to load
```

## Accessing Content
The book is divided into "sections" in the **spine**.

```javascript
// Get a section object by index
const section = book.spine.get(index);

// Load the section content
// This returns the chapter's HTML as a string (or Document depending on version)
const contents = await section.load(book.load.bind(book));
```

## Navigation
- `book.spine.length`: Total number of sections.
- `book.spine.get(index)`: Returns a section object.

## Metadata
```javascript
const metadata = await book.loaded.metadata;
// { title, creator, description, etc. }
```
