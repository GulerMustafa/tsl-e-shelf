"use client";

import { IReaderPreferenceConfig, readerPreferencesAtom, readerThemeNameAtom, THEME_PRESETS } from "@/atoms/reader-preferences";
import clsx from "clsx";
import { useAtom } from "jotai";
import { ALargeSmall } from "lucide-react";
import { useTheme } from "next-themes";
import { FontSizeToggler } from "./font-size-toggler";
import { ReaderSettingsCustom } from "./reader-settings-custom";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

interface ReaderSettingsProps {
  getPreviewText: (charCount?: number) => Promise<string | null>;
}

export const ReaderSettings = ({ getPreviewText }: ReaderSettingsProps) => {
  const [themeName, setThemeName] = useAtom(readerThemeNameAtom);
  const [, setReaderPrefs] = useAtom(readerPreferencesAtom);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const handleThemeSelect = (newThemeName: keyof typeof THEME_PRESETS) => {
    const newTheme: IReaderPreferenceConfig = THEME_PRESETS[newThemeName];
    setThemeName(newThemeName);
    setReaderPrefs(newTheme);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="ml-2" aria-label="Ayarları aç" type="button">
          <ALargeSmall />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-4">
        <div className="flex flex-col gap-1">
          {/* Font Size + Mode */}
          <div className="flex-1">
            <FontSizeToggler />
          </div>

          <div className="h-px bg-muted mb-4" />

          {/* Theme Picker */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Theme Presets</p>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(THEME_PRESETS).map(([name, config]) => (
                <button
                  key={name}
                  onClick={() => handleThemeSelect(name as keyof typeof THEME_PRESETS)}
                  className={clsx("flex items-center gap-3 px-3 py-2 rounded-md border transition-all", themeName === name ? "border-primary bg-accent/20" : "border-border hover:border-muted")}
                >
                  <div
                    className="w-6 h-6 rounded-full border"
                    style={{
                      backgroundColor: isDark ? config.backgroundColor?.dark : config.backgroundColor.light,
                    }}
                  />
                  <div className="flex flex-col items-start">
                    <p
                      className="text-sm font-semibold"
                      style={{
                        fontFamily: config.fontFamily,
                        color: isDark ? config.textColor.dark : config.textColor.light,
                      }}
                    >
                      {name.charAt(0).toUpperCase() + name.slice(1)}
                    </p>
                    <p
                      className="text-sm text-muted-foreground"
                      style={{
                        fontFamily: config.fontFamily,
                        color: isDark ? config.textColor.dark : config.textColor.light,
                      }}
                    >
                      Aa
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="h-px bg-muted my-4" />
        <div className="flex flex-col gap-1">
          <ReaderSettingsCustom getPreviewText={getPreviewText} />
        </div>
      </PopoverContent>
    </Popover>
  );
};
