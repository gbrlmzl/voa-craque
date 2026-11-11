import type { ComponentProps } from "react";

/**
 * Icones do Material (os mesmos do MUI usado no site-rinha-v2), em SVG inline
 * para nao puxar a biblioteca inteira. Herdam a cor via currentColor.
 */
function MaterialIcon({ d, ...props }: ComponentProps<"svg"> & { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1.5em" height="1.5em" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d={d} />
    </svg>
  );
}

type IconProps = ComponentProps<"svg">;

/** Visibility: olho aberto (senha visivel). */
export function EyeIcon(props: IconProps) {
  return (
    <MaterialIcon
      d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5M12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5m0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3"
      {...props}
    />
  );
}

/** VisibilityOff: olho com traco cortado (senha oculta). */
export function EyeOffIcon(props: IconProps) {
  return (
    <MaterialIcon
      d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7M2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2m4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3z"
      {...props}
    />
  );
}

/** CheckCircle: criterio cumprido. */
export function CheckCircleIcon(props: IconProps) {
  return (
    <MaterialIcon
      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z"
      {...props}
    />
  );
}

/** RadioButtonUnchecked: criterio pendente. */
export function RadioUncheckedIcon(props: IconProps) {
  return (
    <MaterialIcon
      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8"
      {...props}
    />
  );
}

/** CheckBoxOutlineBlank: quadrado vazio. */
export function CheckBoxOutlineBlankIcon(props: IconProps) {
  return <MaterialIcon d="M19 5v14H5V5zm0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2" {...props} />;
}

/** CheckBox: quadrado preenchido com o check vazado. */
export function CheckBoxIcon(props: IconProps) {
  return (
    <MaterialIcon
      d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2m-9 14-5-5 1.41-1.42L10 14.17l7.59-7.59L19 8z"
      {...props}
    />
  );
}
