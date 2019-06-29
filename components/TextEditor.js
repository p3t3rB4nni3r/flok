import React from "react";
import { Controlled as CodeMirror } from "react-codemirror2";

import "codemirror/lib/codemirror.css";
import "codemirror/theme/material.css";
import "codemirror/mode/javascript/javascript";
import "codemirror/mode/haskell/haskell";

const TextEditor = props => (
  <React.Fragment>
    <CodeMirror {...props} />
    <style jsx global>
      {`
        .CodeMirror {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          right: 0;
          height: 100%;
        }
      `}
    </style>
  </React.Fragment>
);

export default TextEditor;
