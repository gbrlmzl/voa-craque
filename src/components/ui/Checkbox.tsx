import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CheckBoxIcon, CheckBoxOutlineBlankIcon } from "@/components/ui/icons";
import styles from "@/components/ui/Checkbox.module.css";

type CheckboxProps = Omit<ComponentProps<"input">, "type" | "size"> & {
  /** Texto ao lado do quadrado. Clicar nele tambem marca. */
  label?: ReactNode;
  /** "md" = icone de 24px (padrao do MUI); "sm" = 20px, label menor. */
  size?: "sm" | "md";
};

/**
 * Checkbox com a aparencia do Checkbox do MUI. E um <input type="checkbox">
 * de verdade (teclado, formulario, name/value, checked/onChange) com o visual
 * desenhado em volta; aceita todas as props de <input>.
 */
export function Checkbox({ label, size = "md", className, disabled, ...props }: CheckboxProps) {
  return (
    <label className={cn(styles.root, disabled && styles.rootDisabled, className)}>
      <span className={cn(styles.control, size === "sm" && styles.sm, disabled && styles.controlDisabled)}>
        <input {...props} type="checkbox" disabled={disabled} className={styles.input} />
        <CheckBoxOutlineBlankIcon className={cn(styles.icon, styles.emptyIcon)} />
        <CheckBoxIcon className={cn(styles.icon, styles.checkedIcon)} />
      </span>
      {label ? (
        <span className={cn(styles.label, size === "sm" && styles.labelSm, disabled && styles.labelDisabled)}>
          {label}
        </span>
      ) : null}
    </label>
  );
}
