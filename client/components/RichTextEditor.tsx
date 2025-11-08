import React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bold, Italic, Strikethrough, Link as LinkIcon, FileText, AtSign, List, ListOrdered, Quote, Code, Image } from "lucide-react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value?: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ value = "", onChange, placeholder = "Describe the issue in detail..." }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-blue-600 hover:text-blue-800 underline" },
      }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "prose max-w-none focus:outline-none min-h-[160px] p-4",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  const toggleBold = () => editor?.chain().focus().toggleBold().run();
  const toggleItalic = () => editor?.chain().focus().toggleItalic().run();
  const toggleStrike = () => editor?.chain().focus().toggleStrike().run();
  const toggleBullet = () => editor?.chain().focus().toggleBulletList().run();
  const toggleOrdered = () => editor?.chain().focus().toggleOrderedList().run();
  const toggleBlockquote = () => editor?.chain().focus().toggleBlockquote().run();
  const toggleCode = () => editor?.chain().focus().toggleCode().run();
  const setLink = () => {
    const url = window.prompt("Enter URL:");
    if (url) editor?.chain().focus().setLink({ href: url }).run();
  };

  if (!editor) return null;

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 border-b pb-2">
          <Button type="button" variant="ghost" size="sm" onClick={toggleBold} className={cn("h-8 w-8 p-0", editor.isActive("bold") && "bg-gray-200")}> <Bold className="w-4 h-4" /> </Button>
          <Button type="button" variant="ghost" size="sm" onClick={toggleItalic} className={cn("h-8 w-8 p-0", editor.isActive("italic") && "bg-gray-200")}> <Italic className="w-4 h-4" /> </Button>
          <Button type="button" variant="ghost" size="sm" onClick={toggleStrike} className={cn("h-8 w-8 p-0", editor.isActive("strike") && "bg-gray-200")}> <Strikethrough className="w-4 h-4" /> </Button>

          <div className="h-4 w-px bg-gray-300" />

          <Button type="button" variant="ghost" size="sm" onClick={toggleBullet} className={cn("h-8 w-8 p-0", editor.isActive("bulletList") && "bg-gray-200")}><List className="w-4 h-4"/></Button>
          <Button type="button" variant="ghost" size="sm" onClick={toggleOrdered} className={cn("h-8 w-8 p-0", editor.isActive("orderedList") && "bg-gray-200")}><ListOrdered className="w-4 h-4"/></Button>

          <Button type="button" variant="ghost" size="sm" onClick={toggleBlockquote} className={cn("h-8 w-8 p-0", editor.isActive("blockquote") && "bg-gray-200")}><Quote className="w-4 h-4"/></Button>
          <Button type="button" variant="ghost" size="sm" onClick={toggleCode} className={cn("h-8 w-8 p-0", editor.isActive("code") && "bg-gray-200")}><Code className="w-4 h-4"/></Button>

          <Button type="button" variant="ghost" size="sm" onClick={setLink} className={cn("h-8 w-8 p-0", editor.isActive("link") && "bg-gray-200")}><LinkIcon className="w-4 h-4"/></Button>

          <div className="flex-1" />

          <div className="text-xs text-gray-500">
            <AtSign className="w-3 h-3 inline mr-1" /> Type @ to mention
          </div>
        </div>

        <div className="mt-3 border rounded-md min-h-[160px] focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
          <EditorContent editor={editor} placeholder={placeholder} />
        </div>
      </CardContent>
    </Card>
  );
}
