import { Button } from "@/components/ui/button";
import { Settings, LogOut, Home, AlignRight, AlignJustify } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Typography } from "./ui/typography";
import Link from "next/link";
import { Card } from "./ui/card";

interface Book {
  filename: string;
  title: string;
  id: string;
}

interface MainDrawerProps {
  onDrawerStateChange?: (isPinned: boolean) => void;
}

export function MainDrawer({ onDrawerStateChange }: MainDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    const fetchBooks = async () => {
      const response = await fetch("/api/books/local");
      const data = await response.json();
      setBooks(data);
    };
    fetchBooks();
  }, []);

  return (
    <div
      ref={drawerRef}
      className={`hidden md:flex fixed left-0 top-0 h-full bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shadow-md p-4 mt-1 flex-col space-y-4 transition-all duration-300 z-50
        ${isPinned ? "w-64" : "w-20 items-center"}`}
    >
      {isPinned ? (
        <div className="flex items-center justify-between w-full">
          <Link href="/" className="flex items-center gap-2 p-2 hover:bg-accent hover:text-accent-foreground rounded-md cursor-pointer">
            <Home className="w-6 h-6" />
            <div className="flex flex-col items-start">
              <Typography variant="h6">Nobel Yayın</Typography>
              <Typography variant="body2" className="text-muted-foreground">
                TSL E-Shelf
              </Typography>
            </div>
          </Link>
          <Button
            variant="ghost"
            onClick={() => {
              setIsPinned(!isPinned);
              onDrawerStateChange?.(!isPinned);
            }}
            aria-label="Collapse Drawer"
            className="p-2"
          >
            <AlignRight className="w-6 h-6" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center w-full">
          <Link href="/" className="flex items-center justify-center p-2 hover:bg-accent hover:text-accent-foreground rounded-md cursor-pointer">
            <Home className="w-6 h-6" />
          </Link>
          <Button
            variant="ghost"
            onClick={() => {
              setIsPinned(!isPinned);
              onDrawerStateChange?.(!isPinned);
            }}
            aria-label="Expand Drawer"
            className="p-2"
          >
            <AlignJustify className="w-6 h-6" />
          </Button>
        </div>
      )}

      <div className="flex flex-col space-y-2 flex-grow">
        <Typography variant="h6" className="font-bold">
          {isPinned && "Kitaplarım"}
        </Typography>
        <ul className="space-y-2">
          {books.map((book) => (
            <li key={book.id}>
              <Link href={`/reader/${book.id}`} className="flex items-center gap-2 p-2 hover:bg-accent hover:text-accent-foreground rounded-md cursor-pointer">
                {isPinned && <Typography variant="body2">• {book.title}</Typography>}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto flex flex-col items-center gap-3 mb-4">
        <Card className={`p-2 w-full ${isPinned ? "flex-row" : "flex-col"} items-center gap-2 bg-gray-200 dark:bg-gray-700`}>
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">HÖ</div>
          {isPinned && (
            <div className="flex flex-col items-start flex-grow">
              <Typography variant="body1">Hasan Özçelik</Typography>
              <Button variant="ghost" size="sm" className="p-0 h-auto justify-start">
                <Settings className="w-4 h-4 mr-1" />
                Ayarlar
              </Button>
            </div>
          )}
        </Card>
        <Button variant="destructive" className="w-full flex items-center gap-2">
          <LogOut className="w-5 h-5" />
          {isPinned && <span>Çıkış Yap</span>}
        </Button>
      </div>
    </div>
  );
}
