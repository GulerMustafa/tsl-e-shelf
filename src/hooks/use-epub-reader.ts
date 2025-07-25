import { copiedCharsAtom, totalBookCharsAtom, copyAllowancePercentageAtom } from "@/atoms/copy-protection";
import { computedReaderStylesAtom } from "@/atoms/computed-reader-styles";
import { readerOverridesAtom } from "@/atoms/reader-preferences";
import { getChapterFromCfi, getPageFromCfi } from "@/lib/epub-utils";
import { getReaderTheme } from "@/lib/get-reader-theme";
import ePub, { Book, Contents, Location, NavItem, Rendition } from "epubjs";
import Section from "epubjs/types/section";
import Spine from "epubjs/types/spine";
import { useAtom } from "jotai";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import useDebounce from "@/hooks/use-debounce";
// TODO: Fit the cover page with no padding
// TODO: Add swipe next/prev page navigation when on mobile
// TODO: The books in the library are rented. Thus, the users should not be able to download, or copy the book content by any means. However, the system should allow the users to copy book content up to a percentage, up to 10% to the total book content, for example. When a section is copied, the copied content percentage should persist. When copying new sections, we should check if it is within allowed percentage or not. When copying content, the user should be prompted, and throughly be informed about their copying action. The user should clearly see what percent of their allowed content they are copying, how much will be left for them to copy, and they are absolutely sure about their copying action

const defaultConfig = {
  highlight: {
    className: "epub-highlight",
    style: {
      fill: "yellow",
      fillOpacity: "0.5",
      mixBlendMode: "multiply",
    },
  },
  underline: {
    className: "epub-underline",
    style: {
      stroke: "yellow",
      strokeWidth: "1",
    },
  },
  note: {
    className: "epub-note",
    style: {
      fill: "lightblue",
      fillOpacity: "0.4",
      mixBlendMode: "multiply",
    },
  },
  searchResult: {
    className: "epub-search-highlight",
    style: {
      fill: "red",
      fillOpacity: "0.3",
      mixBlendMode: "multiply",
    },
  },
  selectedSearchResult: {
    style: {
      fill: "yellow",
      fillOpacity: "100",
      mixBlendMode: "multiply",
    },
  },
};

export type Highlight = {
  id?: string;
  cfi: string;
  text: string;
  type?: HighlightType;
  color?: string;
  rect?: DOMRect;
  createdAt: string;
};

type HighlightType = "highlight" | "underline";

export type Bookmark = {
  cfi: string;
  label?: string;
  createdAt: string;
  chapter: string | null;
  page: number | null;
};

export type Note = {
  cfi: string;
  text: string;
  note: string;
  createdAt: string;
};

export type SearchResult = {
  cfi: string;
  excerpt: string;
  href: string;
  chapterTitle: string;
  chapterIndex: number;
};

export type BookImage = {
  src: string;
  cfi: string;
  description: string;
  chapter: string | null;
  page: number | null;
};

export type EnhancedNavItem = NavItem & {
  page?: number;
  subitems?: EnhancedNavItem[];
};

interface ExtendedSpine extends Spine {
  spineItems: Section[];
}

interface IUseEpubReader {
  url: string;
  isCopyProtected?: boolean;
  copyAllowancePercentage?: number;
}

interface IUseEpubReaderReturn {
  location: string | null;
  imagePreview: { src: string; description: string } | null;
  setImagePreview: React.Dispatch<React.SetStateAction<{ src: string; description: string } | null>>;
  bookImages: BookImage[];
  goNext: () => void;
  goPrev: () => void;
  goToHref: (href: string) => void;
  goToCfi: (cfi: string) => void;
  toc: EnhancedNavItem[];
  viewerRef: React.RefObject<HTMLDivElement | null>;
  addHighlight: (args: Highlight) => void;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  addBookmark: () => void;
  goToBookmark: (cfi: string) => void;
  removeBookmark: (cfiToRemove: string) => void;
  removeAllBookmarks: () => void;
  searchResults: SearchResult[];
  currentSearchResultIndex: number;
  goToSearchResult: (index: number) => void;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  searchBook: (query: string) => Promise<void>;
  removeHighlight: (cfi: string, type: HighlightType) => void;
  removeAllHighlights: () => void;
  addNote: (note: Note) => void;
  notes: Note[];
  removeNote: (cfi: string) => void;
  removeAllNotes: () => void;
  editNote: (cfi: string, newNote: string) => void;
  editingNote: Note | null;
  setEditingNote: React.Dispatch<React.SetStateAction<Note | null>>;
  clickedHighlight: Highlight | null;
  setClickedHighlight: React.Dispatch<React.SetStateAction<Highlight | null>>;
  updateHighlightColor: (cfi: string, newColor: string) => void;
  currentPage: number;
  totalPages: number;
  error: Error | null;
  isLoading: boolean;
  progress: number;
  bookTitle: string | null;
  bookAuthor: string | null;
  bookCover: string | null;
  selection: { cfi: string; text: string; rect: DOMRect } | null;
  setSelection: React.Dispatch<React.SetStateAction<{ cfi: string; text: string; rect: DOMRect } | null>>;
  currentChapterTitle: string | null;
  isSearching: boolean;
  getPreviewText: (charCount?: number) => Promise<string | null>;
  copyText: (text: string) => Promise<void>;
  totalBookChars: number;
  copiedChars: number;
}

export function useEpubReader({ url, isCopyProtected = false, copyAllowancePercentage = 10 }: IUseEpubReader): IUseEpubReaderReturn {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const bookRef = useRef<Book | null>(null);
  const previousSearchHighlights = useRef<string[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [location, setLocation] = useState<string | null>(null);
  const [toc, setToc] = useState<EnhancedNavItem[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [clickedHighlight, setClickedHighlight] = useState<Highlight | null>(null);
  const [spine, setSpine] = useState<ExtendedSpine | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentSearchResultIndex, setCurrentSearchResultIndex] = useState<number>(-1);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [progress, setProgress] = useState<number>(0);
  const [bookTitle, setBookTitle] = useState<string | null>(null);
  const [bookAuthor, setBookAuthor] = useState<string | null>(null);
  const [bookCover, setBookCover] = useState<string | null>(null);
  const [selectedCfi, setSelectedCfi] = useState<string>("");
  const [previousSelectedCfi, setPreviousSelectedCfi] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ cfi: string; text: string; rect: DOMRect } | null>(null);
  const [currentChapterTitle, setCurrentChapterTitle] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<{ src: string; description: string } | null>(null);
  const [bookImages, setBookImages] = useState<BookImage[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const debouncedSearchQuery = useDebounce(searchQuery, 1000);

  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [computedStyles] = useAtom(computedReaderStylesAtom);
  const [overrides] = useAtom(readerOverridesAtom);

  const [totalBookChars, setTotalBookChars] = useAtom(totalBookCharsAtom);
  const [copiedChars, setCopiedChars] = useAtom(copiedCharsAtom);
  const [copyAllowance, setCopyAllowance] = useAtom(copyAllowancePercentageAtom);

  useEffect(() => {
    if (copyAllowancePercentage !== undefined) {
      if (copyAllowancePercentage < 0 || copyAllowancePercentage > 100) {
        console.error("Invalid copyAllowancePercentage. It must be between 0 and 100.");
        throw new Error("Invalid copyAllowancePercentage");
      }
      setCopyAllowance(copyAllowancePercentage);
    }
  }, [copyAllowancePercentage, setCopyAllowance]);

  const STORAGE_KEY_LOC = `epub-location-${url}`;
  const STORAGE_KEY_HIGHLIGHTS = `epub-highlights-${url}`;
  const STORAGE_KEY_BOOKMARK = `epub-bookmarks-${url}`;
  const STORAGE_KEY_NOTES = `epub-notes-${url}`;
  const STORAGE_KEY_TOC = `epub-toc`;
  const STORAGE_KEY_TOTAL_CHARS = `epub-total-chars-${url}`;
  const STORAGE_KEY_COPIED_CHARS = `epub-copied-chars-${url}`;

  const copyText = useCallback(
    async (text: string) => {
      if (!isCopyProtected) {
        try {
          await navigator.clipboard.writeText(text);
        } catch (err) {
          console.error("Failed to copy text (unprotected):", err);
        }
        return;
      }

      const allowedChars = (totalBookChars * copyAllowance) / 100;

      if (copiedChars + text.length > allowedChars) {
        throw new Error("Copy limit exceeded");
      }

      try {
        await navigator.clipboard.writeText(text);
        setCopiedChars((prev) => {
          const newCopiedChars = prev + text.length;
          localStorage.setItem(STORAGE_KEY_COPIED_CHARS, JSON.stringify(newCopiedChars));
          return newCopiedChars;
        });
      } catch (err) {
        console.error("Failed to copy text (protected):", err);
        // Re-throw the error so the calling component can handle it if needed
        throw err;
      }
    },
    [isCopyProtected, totalBookChars, copiedChars, setCopiedChars, STORAGE_KEY_COPIED_CHARS, copyAllowance],
  );

  const addHighlight = useCallback(
    ({ cfi, text, type = "highlight", color = "yellow" }: Highlight) => {
      const config = {
        ...defaultConfig[type],
        style: { ...defaultConfig[type].style, fill: color, stroke: color },
      };
      const newHighlight: Highlight = { cfi, text, color, type, createdAt: new Date().toISOString() };

      renditionRef.current?.annotations.add(type, cfi, { text }, undefined, config.className, config.style);

      setHighlights((prev) => {
        const updated = [...prev, newHighlight];
        localStorage.setItem(STORAGE_KEY_HIGHLIGHTS, JSON.stringify(updated));
        return updated;
      });

      setSelection(null);
    },
    [STORAGE_KEY_HIGHLIGHTS],
  );

  const removeHighlight = useCallback(
    (cfi: string, type: HighlightType) => {
      try {
        renditionRef.current?.annotations.remove(cfi, type);

        const rendition = renditionRef.current;
        if (rendition && rendition.getContents) {
          try {
            const contents = rendition.getContents();
            if (contents && typeof contents === "object") {
              const contentsArray = Array.isArray(contents) ? contents : [contents];
              contentsArray.forEach((content) => {
                if (content && content.document) {
                  const highlightElements = content.document.querySelectorAll(`[data-cfi="${cfi}"]`);
                  highlightElements.forEach((el: Element) => el.remove());

                  const classElements = content.document.querySelectorAll(".epub-highlight");
                  classElements.forEach((el: Element) => {
                    if (el.getAttribute("data-cfi") === cfi) {
                      el.remove();
                    }
                  });
                }
              });
            }
          } catch (domError) {
            console.warn("Error removing highlight from DOM:", domError);
          }
        }
      } catch (error) {
        console.warn("Error removing highlight annotation:", error);
      }

      if (renditionRef.current && location) {
        requestAnimationFrame(() => {
          renditionRef.current?.display(location);
        });
      }

      setHighlights((prev) => {
        const updated = prev.filter((h) => h.cfi !== cfi);
        localStorage.setItem(STORAGE_KEY_HIGHLIGHTS, JSON.stringify(updated));
        return updated;
      });
    },
    [STORAGE_KEY_HIGHLIGHTS, location, renditionRef],
  );

  const removeAllHighlights = useCallback(() => {
    highlights.forEach((highlight) => {
      try {
        renditionRef.current?.annotations.remove(highlight.cfi, "highlight");
      } catch (error) {
        console.warn("Error removing highlight annotation:", error);
      }
    });

    if (renditionRef.current && location) {
      requestAnimationFrame(() => {
        renditionRef.current?.display(location);
      });
    }

    localStorage.removeItem(STORAGE_KEY_HIGHLIGHTS);
    setHighlights([]);
  }, [STORAGE_KEY_HIGHLIGHTS, highlights, location, renditionRef]);

  const addBookmark = useCallback(async () => {
    const book = bookRef.current;
    if (!location || !book) {
      console.warn("addBookmark: not a valid location to add a bookmark. location", location);
      return;
    }

    const chapter = await getChapterFromCfi(book, location);
    const page = getPageFromCfi(book, location);

    const newBookmark: Bookmark = {
      cfi: location,
      createdAt: new Date().toISOString(),
      chapter,
      page,
    };

    setBookmarks((prev) => {
      const updated = [...prev, newBookmark];
      localStorage.setItem(STORAGE_KEY_BOOKMARK, JSON.stringify(updated));
      return updated;
    });
  }, [location, STORAGE_KEY_BOOKMARK]);

  const goToBookmark = useCallback((cfi: string) => {
    if (!cfi) {
      console.warn("goToBookmark: not a valid CFI to go. CFI", cfi);
      return;
    }

    renditionRef.current?.display(cfi);
  }, []);

  const removeBookmark = useCallback(
    (cfiToRemove: string) => {
      setBookmarks((prev) => {
        const updated = prev.filter((b) => b.cfi !== cfiToRemove);
        localStorage.setItem(STORAGE_KEY_BOOKMARK, JSON.stringify(updated));
        return updated;
      });
    },
    [STORAGE_KEY_BOOKMARK],
  );

  const removeAllBookmarks = useCallback(() => {
    setBookmarks(() => {
      localStorage.removeItem(STORAGE_KEY_BOOKMARK);
      return [];
    });
  }, [STORAGE_KEY_BOOKMARK]);

  const goNext = useCallback(() => {
    renditionRef.current?.next();
  }, []);

  const goPrev = useCallback(() => {
    renditionRef.current?.prev();
  }, []);

  const goToHref = useCallback((href: string) => {
    renditionRef.current?.display(href);
  }, []);

  const goToCfi = useCallback((cfi: string) => {
    setSelectedCfi(cfi);
    renditionRef.current?.display(cfi);
  }, []);

  const addNote = useCallback(
    ({ cfi, text, note }: Note) => {
      const newNote: Note = { cfi, text, note, createdAt: new Date().toISOString() };

      // visually annotate
      renditionRef.current?.annotations.add("highlight", cfi, { text }, undefined, defaultConfig.note.className, defaultConfig.note.style);

      // update state + localStorage
      setNotes((prev) => {
        const updated = [...prev, newNote];
        localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(updated));
        return updated;
      });
      setSelection(null);
    },
    [STORAGE_KEY_NOTES],
  );

  const removeNote = useCallback(
    (cfi: string) => {
      renditionRef.current?.annotations.remove(cfi, "highlight");
      setNotes((prev) => {
        const updated = prev.filter((n) => n.cfi !== cfi);
        localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(updated));
        return updated;
      });
    },
    [STORAGE_KEY_NOTES],
  );

  const removeAllNotes = useCallback(() => {
    notes.forEach((note) => {
      renditionRef.current?.annotations.remove(note.cfi, "highlight");
    });
    setNotes(() => {
      localStorage.removeItem(STORAGE_KEY_NOTES);
      return [];
    });
  }, [STORAGE_KEY_NOTES, notes]);

  const editNote = useCallback(
    (cfi: string, newNote: string) => {
      setNotes((prev) => {
        const updated = prev.map((n) => (n.cfi === cfi ? { ...n, note: newNote } : n));
        localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(updated));
        return updated;
      });
    },
    [STORAGE_KEY_NOTES],
  );

  const updateHighlightColor = useCallback(
    (cfi: string, newColor: string) => {
      setHighlights((prev) => {
        const updated = prev.map((h) => {
          if (h.cfi === cfi) {
            // Remove old annotation
            renditionRef.current?.annotations.remove(cfi, h.type || "highlight");
            // Add new annotation with updated color
            renditionRef.current?.annotations.add(h.type || "highlight", cfi, { text: h.text }, undefined, defaultConfig[h.type || "highlight"].className, {
              ...defaultConfig[h.type || "highlight"].style,
              fill: newColor,
              stroke: newColor,
            });
            return { ...h, color: newColor };
          }
          return h;
        });
        localStorage.setItem(STORAGE_KEY_HIGHLIGHTS, JSON.stringify(updated));
        return updated;
      });
    },
    [STORAGE_KEY_HIGHLIGHTS],
  );

  const enhanceTocWithPages = useCallback(async (tocItems: NavItem[], book: Book): Promise<EnhancedNavItem[]> => {
    const enhanceItem = async (item: NavItem, index: number): Promise<EnhancedNavItem> => {
      let page: number | undefined;

      try {
        if (book.locations?.length() > 0) {
          page = Math.floor((index / tocItems.length) * book.locations.length()) + 1;

          if (page < 1) page = 1;
          if (page > book.locations.length()) page = book.locations.length();
        }
      } catch (error) {
        console.warn("Error estimating page for TOC item:", error);
      }

      const enhancedItem: EnhancedNavItem = {
        ...item,
        page,
      };

      if (item.subitems && item.subitems.length > 0) {
        enhancedItem.subitems = await Promise.all(item.subitems.map((subitem, subIndex) => enhanceItem(subitem, index + subIndex + 1)));
      }

      return enhancedItem;
    };

    return Promise.all(tocItems.map((item, index) => enhanceItem(item, index)));
  }, []);

  const searchBook = useCallback(
    async (query: string) => {
      setIsSearching(true);
      const book = bookRef.current;
      if (!query || !book || !spine) {
        console.warn(`Invalid searchBook call`);
        setSearchResults([]);
        setCurrentSearchResultIndex(-1);
        return;
      }

      const trimmedQuery = query.trim().toLowerCase();
      if (!trimmedQuery) {
        setSearchResults([]);
        setCurrentSearchResultIndex(-1);
        return;
      }

      const results: SearchResult[] = [];
      const spineItems = (spine as ExtendedSpine)?.spineItems ?? [];
      if (!Array.isArray(spineItems) || spineItems.length === 0) {
        setSearchResults([]);
        setCurrentSearchResultIndex(-1);
        return;
      }
      const contextLength = 30;

      const promises = spineItems.map(async (item, chapterIndex) => {
        try {
          await item.load(book.load.bind(book));
          const doc = item.document;
          if (!doc) return;

          const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
          const textNodes: Node[] = [];
          let node: Node | null;
          while ((node = walker.nextNode())) textNodes.push(node);

          const fullText = textNodes
            .map((n) => n.textContent || "")
            .join("")
            .toLowerCase();

          let pos = fullText.indexOf(trimmedQuery);
          while (pos !== -1) {
            let offset = pos;
            let nodeIndex = 0;

            // Find the matching node and offset
            while (nodeIndex < textNodes.length) {
              const nodeText = textNodes[nodeIndex].textContent || "";
              if (offset < nodeText.length) break;
              offset -= nodeText.length;
              nodeIndex++;
            }

            if (nodeIndex < textNodes.length) {
              try {
                const range = doc.createRange();
                range.setStart(textNodes[nodeIndex], offset);
                range.setEnd(textNodes[nodeIndex], offset + trimmedQuery.length);

                const cfi = item.cfiFromRange(range);
                const excerpt = fullText.substring(Math.max(0, pos - contextLength), pos + trimmedQuery.length + contextLength);

                const chapterTitle = await getChapterFromCfi(book, cfi);

                results.push({
                  cfi,
                  excerpt: `...${excerpt}...`,
                  href: item.href,
                  chapterTitle: chapterTitle || "",
                  chapterIndex,
                });
              } catch (e) {
                console.warn("Invalid range during search", e);
              }
            }

            pos = fullText.indexOf(trimmedQuery, pos + 1);
          }

          item.unload?.();
        } catch (error) {
          console.error("Error searching spine item:", error);
        }
      });

      await Promise.all(promises);
      setSearchResults(results);
      setCurrentSearchResultIndex(results.length > 0 ? 0 : -1);
      setIsSearching(false);
    },
    [bookRef, spine],
  );

  const goToSearchResult = useCallback(
    (index: number) => {
      if (index >= 0 && index < searchResults.length) {
        const result = searchResults[index];
        renditionRef.current?.display(result.cfi);
        setSelectedCfi(result.cfi);
        setCurrentSearchResultIndex(index);
      }
    },
    [searchResults],
  );

  const getPreviewText = useCallback(async (charCount = 250) => {
    const book = bookRef.current;
    if (!book || !book.locations) return null;

    // Use the middle of the book for the preview
    const cfi = book.locations.cfiFromPercentage(0.5);
    const section = await book.spine.get(cfi);
    if (!section) return null;

    await section.load(book.load.bind(book));
    const text = section.document.body.textContent?.trim().slice(0, charCount) || null;
    section.unload();

    return text;
  }, []);

  // SEARCH EFFECT
  useEffect(() => {
    if (debouncedSearchQuery.trim().length === 0) {
      setSearchResults([]);
      setCurrentSearchResultIndex(-1);
      return;
    }

    if (debouncedSearchQuery.length >= 3) {
      searchBook(debouncedSearchQuery);
    }
  }, [debouncedSearchQuery, searchBook]);

  // HIGHLIGHT SEARCH RESULTS EFFECT
  useEffect(() => {
    if (!renditionRef.current) return;

    // Clear previous search highlights
    for (const cfi of previousSearchHighlights.current) {
      renditionRef.current?.annotations.remove(cfi, "highlight");
    }
    previousSearchHighlights.current = [];

    // Add new highlights
    for (const result of searchResults) {
      renditionRef.current.annotations.add("highlight", result.cfi, { text: result.excerpt }, undefined, defaultConfig.searchResult.className, defaultConfig.searchResult.style);
      previousSearchHighlights.current.push(result.cfi);
    }
  }, [searchResults]);

  // HIGHLIGHT SELECTED SEARCH EFFECT
  useEffect(() => {
    if (!selectedCfi || !renditionRef.current) return;

    // Remove the previous highlight
    if (previousSelectedCfi) renditionRef.current.annotations.remove(previousSelectedCfi, "highlight");

    // Add the new highlight with inline styles
    renditionRef.current.annotations.add(
      "highlight",
      selectedCfi,
      {}, // data
      undefined, // cb
      undefined, // no className
      defaultConfig.selectedSearchResult.style,
    );
    setPreviousSelectedCfi(selectedCfi);
  }, [previousSelectedCfi, selectedCfi]);

  // Effect for book initialization and cleanup
  useEffect(() => {
    if (!viewerRef.current) return;

    setError(null); // Clear previous errors
    setIsLoading(true); // Set loading to true at the start

    try {
      const book = ePub(url);
      const rendition = book.renderTo(viewerRef.current, {
        width: "100%",
        height: "100%",
        allowScriptedContent: true,
      });

      bookRef.current = book;
      renditionRef.current = rendition;

      book.ready.then(async () => {
        const metadata = await book.loaded.metadata;
        setBookTitle(metadata.title);
        setBookAuthor(metadata.creator || null);

        const coverUrl = await book.coverUrl();
        setBookCover(coverUrl);
        const originalToc = book.navigation?.toc || [];
        setSpine(book.spine as ExtendedSpine);
        await book.locations.generate(5000);

        if (isCopyProtected) {
          const savedTotalChars = localStorage.getItem(STORAGE_KEY_TOTAL_CHARS);
          if (savedTotalChars) {
            setTotalBookChars(JSON.parse(savedTotalChars));
          } else {
            const allText = await Promise.all(
              (book.spine as ExtendedSpine).spineItems.map(async (item) => {
                await item.load(book.load.bind(book));
                const text = item.document.body.textContent || "";
                item.unload();
                return text;
              }),
            );
            const totalChars = allText.join("").length;
            setTotalBookChars(totalChars);
            localStorage.setItem(STORAGE_KEY_TOTAL_CHARS, JSON.stringify(totalChars));
          }

          const savedCopiedChars = localStorage.getItem(STORAGE_KEY_COPIED_CHARS);
          if (savedCopiedChars) {
            setCopiedChars(JSON.parse(savedCopiedChars));
          }
        }

        setTotalPages(book.locations.length());

        try {
          const enhancedToc = await enhanceTocWithPages(originalToc, book);
          setToc(enhancedToc);
          localStorage.setItem(STORAGE_KEY_TOC, JSON.stringify(enhancedToc));
        } catch (error) {
          console.warn("Error enhancing TOC with pages:", error);
          setToc(originalToc as EnhancedNavItem[]);
          localStorage.setItem(STORAGE_KEY_TOC, JSON.stringify(originalToc));
        }

        const savedLocation = localStorage.getItem(STORAGE_KEY_LOC);
        rendition.display(savedLocation || undefined);

        const initialCfi = savedLocation || book.rendition.currentLocation().cfi;
        if (initialCfi) {
          const initialPage = getPageFromCfi(book, initialCfi) || 1;
          setCurrentPage(initialPage);
        }

        if (savedLocation) {
          setCurrentPage(getPageFromCfi(book, savedLocation) || 1);
        }
        setIsLoading(false);

        // Extract images
        const images: BookImage[] = [];
        const spine = book.spine as ExtendedSpine;
        for (const item of spine.spineItems) {
          try {
            await item.load(book.load.bind(book));
            const doc = item.document;
            if (!doc) continue;

            const imgElements = doc.querySelectorAll("img");
            for (const img of Array.from(imgElements)) {
              const cfi = item.cfiFromElement(img);
              const description = img.title || img.alt || "";
              const chapter = await getChapterFromCfi(book, cfi);
              const page = getPageFromCfi(book, cfi);
              images.push({ src: img.src, cfi, description, chapter, page });
            }
            item.unload?.();
          } catch (error) {
            console.warn("Error extracting images from spine item:", error);
          }
        }
        setBookImages(images);
      });

      bookRef.current = book;
      renditionRef.current = rendition;

      return () => {
        book.destroy();
        rendition.destroy();
      };
    } catch (err) {
      console.error("Error initializing EPUB reader:", err);
      setError(err as Error);
      setIsLoading(false);
    }
  }, [url, STORAGE_KEY_LOC, STORAGE_KEY_TOC, enhanceTocWithPages, isCopyProtected, STORAGE_KEY_TOTAL_CHARS, setTotalBookChars, STORAGE_KEY_COPIED_CHARS, setCopiedChars]);

  // Effect for theming
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;

    const themeObject = getReaderTheme(isDark, {
      ...computedStyles,
      ...overrides,
    });

    if (rendition?.themes) {
      rendition.themes.register("custom-theme", themeObject);
      rendition.themes.default({ override: true });
      rendition.themes.select("custom-theme");
    } else {
      console.warn("Rendition themes not initialized");
    }

    rendition.hooks.content.register((contents: Contents) => {
      // This hook is for content that is newly rendered or re-rendered
      // We still want to ensure the theme is applied here for new content
      if (rendition?.themes) {
        rendition.themes.select("custom-theme");
      }

      // Disable right-click context menu and copy shortcuts while preserving text selection
      const doc = contents.document;
      if (doc) {
        // Disable context menu
        doc.addEventListener(
          "contextmenu",
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
          },
          true,
        );

        // Disable copy shortcuts (Ctrl+C, Ctrl+A, Ctrl+X, etc.)
        doc.addEventListener(
          "keydown",
          (e) => {
            // Disable copy, cut, select all, print shortcuts
            if (e.ctrlKey || e.metaKey) {
              if (["c", "x", "a", "p", "s"].includes(e.key.toLowerCase())) {
                e.preventDefault();
                e.stopPropagation();
                return false;
              }
            }

            // Disable F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U (developer tools)
            if (e.key === "F12" || (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key)) || (e.ctrlKey && e.key === "U") || (e.metaKey && e.altKey && e.key === "I")) {
              e.preventDefault();
              e.stopPropagation();
              return false;
            }
          },
          true,
        );

        // Disable drag and drop
        doc.addEventListener(
          "dragstart",
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
          },
          true,
        );

        // Disable text selection on images specifically
        const images = doc.querySelectorAll("img");
        images.forEach((img) => {
          img.style.userSelect = "none";
          img.style.webkitUserSelect = "none";
          img.style.setProperty("-moz-user-select", "none");
          img.style.setProperty("-ms-user-select", "none");
          img.draggable = false;
        });
      }
    });
  }, [isDark, computedStyles, renditionRef, overrides]);

  // Effect for handling location changes
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;

    const handleRelocated = async (location: Location) => {
      const cfi = location.start.cfi;
      setLocation(cfi);
      localStorage.setItem(STORAGE_KEY_LOC, cfi);
      const newPage = getPageFromCfi(bookRef.current!, cfi) || 1;
      if (newPage !== currentPage) {
        setCurrentPage(newPage);
      }

      if (bookRef.current) {
        const chapter = await getChapterFromCfi(bookRef.current, cfi);
        setCurrentChapterTitle(chapter);
      }

      // Calculate progress percentage
      if (bookRef.current && bookRef.current.locations.length() > 0) {
        const progressPercentage = Math.round(Math.round(bookRef.current.locations.percentageFromCfi(cfi) * 100));
        setProgress(progressPercentage);
      }
    };

    rendition.on("relocated", handleRelocated);
    return () => {
      rendition.off("relocated", handleRelocated);
    };
  }, [STORAGE_KEY_LOC, currentPage]);

  // Effect for handling text selection and clicks within the reader
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;

    const handleSelected = (cfiRange: string, contents: Contents) => {
      const selectedText = contents.window.getSelection()?.toString();
      if (!selectedText) {
        return;
      }

      const range = contents.window.getSelection()?.getRangeAt(0);
      if (!range) return;

      const rect = range.getBoundingClientRect();
      setSelection({ cfi: cfiRange, text: selectedText, rect });
    };

    const handleClick = async (event: MouseEvent) => {
      const iframeWindow = (event.view as Window) ?? window;
      if (!iframeWindow.getSelection()?.toString()) {
        setSelection(null);
      }

      // Clear any previously clicked highlight
      setClickedHighlight(null);

      const target = event.target as HTMLElement;

      // Check if the click is on a note annotation
      const x = event.clientX;
      const y = event.clientY;

      for (const note of notes) {
        try {
          const range = renditionRef.current?.getRange(note.cfi);
          if (range) {
            const rects = range.getClientRects();
            for (let i = 0; i < rects.length; i++) {
              const rect = rects[i];
              if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                setEditingNote(note);
                return; // Found the clicked note, no need to check further
              }
            }
          }
        } catch (error) {
          console.warn("Error getting range for note CFI:", note.cfi, error);
        }
      }

      // Check if the click is on a highlight annotation
      for (const highlight of highlights) {
        try {
          const range = renditionRef.current?.getRange(highlight.cfi);
          if (range) {
            const rects = range.getClientRects();
            for (let i = 0; i < rects.length; i++) {
              const rect = rects[i];
              if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                setClickedHighlight(highlight);
                return; // Found the clicked highlight, no need to check further
              }
            }
          }
        } catch (error) {
          console.warn("Error getting range for highlight CFI:", highlight.cfi, error);
        }
      }

      if (target.tagName === "IMG") {
        event.preventDefault();
        event.stopPropagation();

        const img = target as HTMLImageElement;
        const description = img.title || img.alt || ""; // fallback to alt if no title

        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;

          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Failed to get canvas context");

          ctx.drawImage(img, 0, 0);

          canvas.toBlob((blob) => {
            if (blob) {
              const objectUrl = URL.createObjectURL(blob);

              // ✅ Set full preview object
              setImagePreview({
                src: objectUrl,
                description,
              });
            } else {
              console.error("Failed to convert image to blob");
              setImagePreview(null);
            }
          }, "image/png");
        } catch (error) {
          console.error("Error capturing image preview:", error);
          setImagePreview(null);
        }
      }
    };

    rendition.on("selected", handleSelected);
    rendition.on("click", handleClick);

    return () => {
      rendition.off("selected", handleSelected);
      rendition.off("click", handleClick);
    };
  }, [notes, highlights]);

  // Effect for loading saved highlights
  useEffect(() => {
    const savedHighlights = localStorage.getItem(STORAGE_KEY_HIGHLIGHTS);
    if (savedHighlights) {
      try {
        const parsed: Highlight[] = JSON.parse(savedHighlights);
        parsed.forEach(({ cfi, text, color, createdAt }) => addHighlight({ cfi, text, color, createdAt }));
        setHighlights(parsed);
      } catch (err) {
        console.error("Failed to parse saved highlights", err);
      }
    }
  }, [STORAGE_KEY_HIGHLIGHTS, addHighlight]);

  // Effect for loading saved bookmarks
  useEffect(() => {
    const savedBookmarks = localStorage.getItem(STORAGE_KEY_BOOKMARK);
    if (savedBookmarks) {
      try {
        setBookmarks(JSON.parse(savedBookmarks));
      } catch {
        console.warn("Failed to parse saved bookmarks");
      }
    }
  }, [STORAGE_KEY_BOOKMARK]);

  // Effect for loading saved notes
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;

    const savedNotes = localStorage.getItem(STORAGE_KEY_NOTES);
    if (savedNotes) {
      const parsed = JSON.parse(savedNotes) as Note[];
      parsed.forEach((note) => {
        rendition.annotations.add("highlight", note.cfi, { text: note.text }, undefined, defaultConfig.note.className, defaultConfig.note.style);
      });
      setNotes(parsed);
    }
  }, [STORAGE_KEY_NOTES, renditionRef]);

  return {
    toc,
    location,
    viewerRef,
    highlights,
    bookmarks,
    searchResults,
    searchQuery,
    notes,
    removeHighlight,
    removeAllHighlights,
    setSearchQuery,
    addHighlight,
    addBookmark,
    goToBookmark,
    removeBookmark,
    removeAllBookmarks,
    goToHref,
    goToCfi,
    goNext,
    goPrev,
    addNote,
    removeNote,
    removeAllNotes,
    editNote,
    editingNote,
    setEditingNote,
    clickedHighlight,
    setClickedHighlight,
    updateHighlightColor,
    currentPage,
    totalPages,
    error,
    isLoading,
    progress,
    bookTitle,
    bookAuthor,
    bookCover,
    selection,
    setSelection,
    currentSearchResultIndex,
    goToSearchResult,
    currentChapterTitle,
    imagePreview,
    setImagePreview,
    bookImages,
    searchBook,
    isSearching,
    getPreviewText,
    copyText,
    totalBookChars,
    copiedChars,
  };
}
