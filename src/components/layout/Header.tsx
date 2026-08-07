interface HeaderProps {
  title: string
  rightAction?: React.ReactNode
  showBack?: boolean
  onBack?: () => void
}

export function Header({ title, rightAction, showBack, onBack }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {showBack && (
            <button
              onClick={onBack}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600"
            >
              ←
            </button>
          )}
          <h1 className="text-lg font-bold text-gray-900">{title}</h1>
        </div>
        {rightAction}
      </div>
    </header>
  )
}
