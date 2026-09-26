import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, type LucideIcon } from 'lucide-react';

export type MeasureSplitOption = {
  disabled?: boolean;
  disabledReason?: string;
  id: string;
  label: string;
};

type MeasureSplitButtonProps = {
  active: boolean;
  activeOptionId?: string | null;
  defaultOptionId: string;
  icon: LucideIcon;
  label: string;
  options: MeasureSplitOption[];
  onActivate: (id: string) => void;
};

export function MeasureSplitButton({
  active,
  activeOptionId,
  defaultOptionId,
  icon: Icon,
  label,
  options,
  onActivate,
}: MeasureSplitButtonProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isMenuOpen]);

  const mainOptionId = options.some((option) => option.id === defaultOptionId && !option.disabled)
    ? defaultOptionId
    : options.find((option) => !option.disabled)?.id ?? defaultOptionId;

  return (
    <div className="ribbon-measure-split" ref={rootRef}>
      <button
        className={active ? 'is-active' : undefined}
        type="button"
        title={label}
        onClick={() => onActivate(mainOptionId)}
      >
        <Icon size={17} strokeWidth={1.8} />
        <span>{label}</span>
      </button>
      <button
        aria-label={`${label}更多选项`}
        aria-expanded={isMenuOpen}
        className={isMenuOpen ? 'is-open' : undefined}
        title={`${label}选项`}
        type="button"
        onClick={() => setIsMenuOpen((value) => !value)}
      >
        <ChevronDown size={12} strokeWidth={2} />
      </button>
      {isMenuOpen ? (
        <div className="ribbon-measure-menu" role="menu" aria-label={`${label}选项`}>
          {options.map((option) => {
            const isCurrent = active && activeOptionId === option.id;

            return (
              <button
                className={option.disabled ? 'is-muted' : undefined}
                disabled={option.disabled}
                key={option.id}
                role="menuitemradio"
                aria-checked={isCurrent}
                title={option.disabled ? option.disabledReason : option.label}
                type="button"
                onClick={() => {
                  if (option.disabled) {
                    return;
                  }

                  setIsMenuOpen(false);
                  onActivate(option.id);
                }}
              >
                <span className="ribbon-measure-menu-check">
                  {isCurrent ? <Check size={13} strokeWidth={2.2} /> : null}
                </span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
