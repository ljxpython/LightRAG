import { useState, useCallback } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import Button from '@/components/ui/Button'
import { useSettingsStore } from '@/stores/settings'
import { PaletteIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface AppSettingsProps {
  className?: string
}

export default function AppSettings({ className }: AppSettingsProps) {
  const [opened, setOpened] = useState<boolean>(false)
  const { t } = useTranslation()

  const language = useSettingsStore.use.language()
  const setLanguage = useSettingsStore.use.setLanguage()

  const theme = useSettingsStore.use.theme()
  const setTheme = useSettingsStore.use.setTheme()

  const handleLanguageChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setLanguage(e.target.value as 'en' | 'zh' | 'fr' | 'ar' | 'zh_TW' | 'ru' | 'ja' | 'de' | 'uk' | 'ko' | 'vi' | 'id')
  }, [setLanguage])

  const handleThemeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setTheme(e.target.value as 'light' | 'dark' | 'system')
  }, [setTheme])

  return (
    <Popover open={opened} onOpenChange={setOpened}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          side="bottom"
          tooltip={t('header.appSettings')}
          aria-label={t('header.appSettings')}
          className={cn(
            'relative h-9 w-9 after:absolute after:-inset-1 after:content-[\'\']',
            className
          )}
        >
          <PaletteIcon className="h-5 w-5" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-56 p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">{t('settings.language')}</label>
            <select
              value={language}
              onChange={handleLanguageChange}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
            >
              <option value="en">English</option>
              <option value="zh">简体中文</option>
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
              <option value="zh_TW">繁體中文</option>
              <option value="ru">Русский</option>
              <option value="ja">日本語</option>
              <option value="de">Deutsch</option>
              <option value="uk">Українська</option>
              <option value="ko">한국어</option>
              <option value="vi">Tiếng Việt</option>
              <option value="id">Bahasa Indonesia</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">{t('settings.theme')}</label>
            <select
              value={theme}
              onChange={handleThemeChange}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
            >
              <option value="light">{t('settings.light')}</option>
              <option value="dark">{t('settings.dark')}</option>
              <option value="system">{t('settings.system')}</option>
            </select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
