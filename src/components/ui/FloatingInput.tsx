"use client";

import { useId, useState, type ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { EyeIcon, EyeOffIcon } from "@/components/ui/icons";
import styles from "@/components/ui/FloatingInput.module.css";

type FloatingInputProps = Omit<ComponentProps<"input">, "placeholder"> & {
  label: string;
  /** Mensagem de erro; some o hint e deixa o campo vermelho. */
  error?: string;
  hint?: string;
  /**
   * Em campos type="password" o botao de olho e interno. Passe `revealed` +
   * `onRevealedChange` para varios campos dividirem o mesmo estado (como
   * senha e confirmacao no cadastro).
   */
  revealed?: boolean;
  onRevealedChange?: (revealed: boolean) => void;
  /** Mostra o botao de olho nos campos de senha (padrao). Desligue no campo "repita a senha". */
  showToggle?: boolean;
};

/**
 * Campo de texto com label flutuante (o "placeholder" fica dentro do campo,
 * apagado, e sobe para o canto superior esquerdo ao focar ou preencher).
 * Aceita todas as props de <input>, menos placeholder.
 */
export function FloatingInput({
  label,
  error,
  hint,
  type = "text",
  revealed,
  onRevealedChange,
  showToggle = true,
  className,
  id,
  disabled,
  ...props
}: FloatingInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const helpId = `${inputId}-help`;
  const [ownRevealed, setOwnRevealed] = useState(false);

  const isPassword = type === "password";
  const hasToggle = isPassword && showToggle;
  const visible = revealed ?? ownRevealed;
  const toggle = () => (onRevealedChange ?? setOwnRevealed)(!visible);
  const help = error ?? hint;

  return (
    <div className={className}>
      <div className={styles.root}>
        <input
          {...props}
          id={inputId}
          type={isPassword && visible ? "text" : type}
          // O espaco faz :placeholder-shown valer so com o campo vazio; e ele
          // que mantem o label embaixo ou em cima sem JS.
          placeholder=" "
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={help ? helpId : undefined}
          className={cn(styles.input, hasToggle && styles.withAdornment)}
        />
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
        <fieldset aria-hidden="true" className={styles.fieldset}>
          <legend className={styles.legend}>
            <span>{label}</span>
          </legend>
        </fieldset>
        {hasToggle ? (
          <button
            type="button"
            onClick={toggle}
            disabled={disabled}
            tabIndex={-1}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={visible}
            className={styles.adornment}
          >
            {visible ? <EyeIcon /> : <EyeOffIcon />}
          </button>
        ) : null}
      </div>
      {help ? (
        <p id={helpId} className={cn("mt-1 px-3.5 text-xs", error ? "text-rose-400" : "text-slate-500")}>
          {help}
        </p>
      ) : null}
    </div>
  );
}
