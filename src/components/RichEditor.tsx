"use client";

// 最小可用的富文字編輯器（NDA／備註共用）：粗體/斜體/底線/清單，用瀏覽器內建 execCommand
// 實作，不引入外部套件。存進 Ragic 的就是 contenteditable 區塊的 innerHTML。
// 這是非受控元件：initialHtml 只在掛載時套用一次，要換成別的內容請改 key 重新掛載。
import { useEffect, useRef } from "react";

const TOOLS = [
  { cmd: "bold", label: <b>B</b> },
  { cmd: "italic", label: <i>I</i> },
  { cmd: "underline", label: <u>U</u> },
  { cmd: "insertUnorderedList", label: "• 清單" },
  { cmd: "insertOrderedList", label: "1. 清單" },
];

export function RichEditor({ initialHtml, onChange }: { initialHtml: string; onChange: (html: string) => void }) {
  const editableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editableRef.current) editableRef.current.innerHTML = initialHtml;
    // 只在掛載時套用初始內容
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-white">
      <div className="flex gap-1 border-b border-line bg-subtle p-1.5">
        {TOOLS.map((tool) => (
          <button
            key={tool.cmd}
            type="button"
            className="cursor-pointer rounded-md border border-line bg-white px-2.5 py-1 text-[13px] hover:border-navy-2"
            // mousedown 先擋掉預設行為，不然點按鈕當下 contenteditable 會先失焦，抓不到原本選取的範圍
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editableRef.current?.focus();
              document.execCommand(tool.cmd, false);
              onChange(editableRef.current?.innerHTML ?? "");
            }}
          >
            {tool.label}
          </button>
        ))}
      </div>
      <div
        ref={editableRef}
        contentEditable
        suppressContentEditableWarning
        className="rich-content max-h-80 min-h-[120px] overflow-y-auto px-3 py-2.5 focus:outline-none"
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
      />
    </div>
  );
}
