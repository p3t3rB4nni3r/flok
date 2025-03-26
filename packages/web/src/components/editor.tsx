import "../assets/fonts/IBM Plex Mono/stylesheet.css";
import "../assets/fonts/BigBlue/stylesheet.css";
import "../assets/fonts/Monocraft/stylesheet.css";
import "../assets/fonts/JetBrains/stylesheet.css";
import "../assets/fonts/JGS/stylesheet.css";
import "../assets/fonts/StepsMono/stylesheet.css";
import "../assets/fonts/FiraCode/stylesheet.css";
import "../assets/fonts/SyneMono/stylesheet.css";
import "../assets/fonts/VT323/stylesheet.css";
import "../assets/fonts/RobotoMono/stylesheet.css";
import "../assets/fonts/UbuntuMono/stylesheet.css";
import "../assets/fonts/OpenDyslexic/stylesheet.css";

import { useQuery } from "@/hooks/use-query";
import {
  langByTarget as langByTargetUntyped,
  panicCodes as panicCodesUntyped,
  targetsWithDocumentEvalMode,
  noAutoIndent,
  webTargets,
} from "@/settings.json";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EditorState, Prec } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers as lineNumbersExtension,
} from "@codemirror/view";

import { evalKeymap, flashField, remoteEvalFlash } from "@flok-editor/cm-eval";
import { tidal } from "@flok-editor/lang-tidal";
import { punctual } from "@flok-editor/lang-punctual";
import type { Document } from "@flok-editor/session";
import { highlightExtension } from "@strudel/codemirror";
import CodeMirror, {
  ReactCodeMirrorProps,
  ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import { vim } from "@replit/codemirror-vim";
import React, {useEffect, useState} from "react";
import { yCollab } from "y-codemirror.next";
import { UndoManager } from "yjs";
import themes from "@/lib/themes";
import { toggleLineComment, insertNewline } from "@codemirror/commands";

const defaultLanguage = "javascript";
const langByTarget = langByTargetUntyped as { [lang: string]: string };
const langExtensionsByLanguage: { [lang: string]: any } = {
  javascript: javascript,
  python: python,
  tidal: tidal,
  punctual: punctual,
};
const panicCodes = panicCodesUntyped as { [target: string]: string };
let socket: WebSocket;
let isOpened = false;
let hasStarted = false;
const panicKeymap = (
  doc: Document,
  keys: string[] = ["Cmd-.", "Ctrl-.", "Alt-."],
) => {
  const panicCode = panicCodes[doc.target];

  return panicCode
    ? keymap.of([
        ...keys.map((key) => ({
          key,
          run() {
            doc.evaluate(panicCode, { from: null, to: null });
            return true;
          },
        })),
      ])
    : [];
};

// extra keymaps
const extraKeymap = () => {
  return keymap.of([
    // fixes the Cmd/Alt-/ issue for Spanish keyboards
    { key: "Shift-Cmd-7", run: toggleLineComment },
    { key: "Shift-Alt-7", run: toggleLineComment },
    { key: "Alt-/", run: toggleLineComment },
    { key: "Ctrl-/", run: toggleLineComment },
  ]);
};

// overwrites the default insertNewlineAndIndent command on Enter
const autoIndentKeymap = (doc: Document) => {
  // if any of the targets is part of the noAutoIndent setting in settings.json
  const noIndent = noAutoIndent.includes(doc.target);
  // overwrite the Enter with insertNewline
  return noIndent
    ? Prec.high(keymap.of([{ key: "Enter", run: insertNewline }]))
    : [];
};

interface FlokSetupOptions {
  readOnly?: boolean;
}

const flokSetup = (
  doc: Document,
  { readOnly = false }: FlokSetupOptions = {},
) => {
  const text = doc.getText();
  const undoManager = new UndoManager(text);
  const defaultMode = targetsWithDocumentEvalMode.includes(doc.target)
    ? "document"
    : "block";
  const web = webTargets.includes(doc.target);

  return [
    flashField(),
    remoteEvalFlash(doc),
    Prec.high(evalKeymap(doc, { defaultMode, web })),
    panicKeymap(doc),
    extraKeymap(),
    autoIndentKeymap(doc),
    yCollab(text, doc.session.awareness, {
      undoManager,
      hideCaret: readOnly,
      showLocalCaret: true,
    }),
  ];
};

export interface EditorSettings {
  theme: string;
  fontFamily: string;
  lineNumbers: boolean;
  wrapText: boolean;
  vimMode: boolean;
  username: string;
}

export interface EditorProps extends ReactCodeMirrorProps {
  document?: Document;
  extensionSettings?: any;
  settings?: EditorSettings;
  ref: React.RefObject<ReactCodeMirrorRef>;
}

interface WordData {
  w: string;
  c: string;
}

interface LineData {
  ws: WordData[];
}

function parseTextWithFormatting(rawText: string, htmlString: string | undefined): LineData[] | undefined {
  if (htmlString) {
    const dom = new DOMParser().parseFromString(htmlString, "text/html");
    const lines = dom.querySelectorAll(".cm-line");

    const output: LineData[] = [];
    let textIndex = 0;

    lines.forEach((lineElement) => {
      const ws: WordData[] = [];
      let currentWord = "";
      let currentClass = "plain";

      lineElement.childNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE && (node as any).tagName === "SPAN") {
          const spanElement = node as HTMLSpanElement;
          const spanText = spanElement.textContent || "";
          let c = spanElement.className || "plain";
          c = c === "cm-ySelectionCaret" ? 'caret' : c;

          for (let i = 0; i < spanText.length; i++) {
            const char = spanText[i];

            // Handle space or reach the end of rawText
            if (char === " " || textIndex >= rawText.length) {
              if (currentWord) {
                ws.push({ w: currentWord, c: currentClass });
                currentWord = "";
              }
              ws.push({ w: " ", c });
            } else {
              currentWord += char;
              currentClass = c;
            }
            textIndex++;
          }

          if (currentWord) {
            ws.push({ w: currentWord, c: currentClass });
            currentWord = "";
          }
        } else if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || "";
          for (const char of text) {
            if (char.trim() === "" || textIndex >= rawText.length) {
              ws.push({ w: char, c: "plain" });
            } else {
              ws.push({ w: char, c: "symbol" });
            }
            textIndex++;
          }
        }
      });

      // Handle the final word that may be left unpushed at the end
      if (currentWord) {
        ws.push({ w: currentWord, c: currentClass });
      }

      output.push({ ws });
    });

    return output;
  }
  return;
}


export const Editor = ({ document, settings, ref, ...props }: EditorProps) => {
  const [mounted, setMounted] = useState(false);
  const query = useQuery();
  const username = settings?.username || "anonymous";
  function connectWebSocket() {
    hasStarted = true;
    socket = new WebSocket('ws://localhost:3335');

    socket.onopen = () => {
      console.log("WebSocket connection established");
      isOpened = true;

    };

    socket.onclose = () => {
      //console.log("WebSocket closed, trying to reconnect...");
      // Optionally, implement a reconnection strategy
      setTimeout(connectWebSocket, 1000);  // Try to reconnect after 1 second
    };

    socket.onerror = (error) => {
      console.error("WebSocket error: ", error);
    };
  }



// Initial connection
  if (!hasStarted)
    connectWebSocket();



  useEffect(() => {
    // Make sure query parameters are set before loading the editor
    if (!query) return;
    setMounted(true);
  }, [query]);


  useEffect(() => {
    if (!document) return;

    // Listen for changes in the Yjs document
    const yText = document.getText();
    const observer = () => {
      setTimeout(() => {
        const cmContentElement = window.document.querySelector('.cm-content');
        // Publish changes via PubSubClient (use the ref here)
        if (isOpened)
          socket.send(JSON.stringify({ html: parseTextWithFormatting(document.getText().toJSON().toString() + " ", cmContentElement?.innerHTML?.trim()) || "", address: '/flok', username }));
      }, 20);
    };

    // Observe changes in the Yjs document
    yText.observe(observer);
    let caretPositionX = 0;
    let caretPositionY = 0;
    // Create a MutationObserver to listen to DOM changes
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach(() => {

        const caretElement = window.document.querySelector('.cm-ySelectionCaret');
        const caretPosition = caretElement?.getBoundingClientRect();
        if (caretPosition){

          if(caretPosition.x !== caretPositionX || caretPosition.y !== caretPositionY){
            caretPositionX = caretPosition.x;
            caretPositionY = caretPosition.y;
            // Publish changes via PubSubClient when caret position changes
            if (isOpened) {
              const cmContentElement = window.document.querySelector('.cm-content');
              socket.send(JSON.stringify({ html: parseTextWithFormatting(document.getText().toJSON().toString() + " ", cmContentElement?.innerHTML?.trim()) || "", address: '/flok', username}));
            }
          }
        }


      });
    });

    setTimeout(() => {
      const cmContentElement = window.document.querySelector('.cm-content');
      const cmThemeElement = window.document.querySelector('.cm-theme');
      const handleScroll = () => {
        // Get scroll position (scrollTop is the number of pixels the document is scrolled vertically)
        const scrollTop = cmThemeElement?.scrollTop || 0;


        // You can publish this data as needed, for example:
        if (isOpened) {
          socket.send(JSON.stringify({ scrollTop, address: '/flok/scrollChange', username }));
        }
      };

      // Add scroll event listener
      if (cmThemeElement) {
        cmThemeElement.addEventListener('scroll', handleScroll);
      }
      if (cmContentElement) {
        mutationObserver.observe(cmContentElement, {
          childList: true, // Observe direct children
          subtree: true,   // Observe all descendants
          characterData: true, // Observe changes to text content
        });
      }
    }, 200)

    // Cleanup the observers when the component is unmounted or document changes
    return () => {
      yText.unobserve(observer);
      mutationObserver.disconnect();
    };
  }, [document]);
  // Re-run when the document changes


  if (!mounted || !document) {
    return null;
  }

  const { theme, fontFamily, lineNumbers, wrapText, vimMode } = {
    theme: "dracula",
    fontFamily: "IBM Plex Mono",
    lineNumbers: false,
    wrapText: false,
    vimMode: false,
    ...settings,
  };

  const readOnly = !!query.get("readOnly");
  const language: string = langByTarget[document.target] || defaultLanguage;
  const languageExtension = langExtensionsByLanguage[language] || null;
  const extensions = [
    EditorView.theme({
      "&": {
        fontFamily: fontFamily,
      },
      ".cm-content": {
        fontFamily: fontFamily,
      },
      ".cm-gutters": {
        fontFamily: fontFamily,
        "margin-right": "10px",
      },
      ".cm-line": {
        "font-size": "105%",
        "font-weight": "600",
        background: "rgba(0, 0, 0, 0.7)",
        "max-width": "fit-content",
        padding: "0px",
      },
      ".cm-activeLine": {
        "background-color": "rgba(0, 0, 0, 1) !important",
      },
      "& .cm-scroller": {
        minHeight: "100vh",
      },
      ".cm-ySelectionInfo": {
        opacity: "1",
        fontFamily: fontFamily,
        color: "black",
        padding: "3px 4px",
        fontSize: "0.8rem",
        "font-weight": "bold",
        top: "1.25em",
        "z-index": "1000",
      },
    }),
    flokSetup(document, { readOnly }),
    languageExtension ? languageExtension() : [],
    highlightExtension,
    readOnly ? EditorState.readOnly.of(true) : [],
    lineNumbers ? lineNumbersExtension() : [],
    vimMode ? vim() : [],
    wrapText ? EditorView.lineWrapping : [],
  ];

  // If it's read-only, put a div in front of the editor so that the user
  // can't interact with it.
  return (
    <>
      {readOnly && <div className="absolute inset-0 z-10" />}
      <CodeMirror
        ref={ref}
        value={document.content}
        theme={themes[theme]?.ext || themes["dracula"]?.ext}
        extensions={extensions}
        basicSetup={{
          foldGutter: false,
          lineNumbers: false,
        }}
        {...props}
      />
    </>
  );
};
