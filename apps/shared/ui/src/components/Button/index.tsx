import * as React from "react"
import { Button as AmsterdamButton } from "@amsterdam/design-system-react"
import './button.scss'

const Button = React.forwardRef<HTMLButtonElement, any>((props, ref) => {
  const { variant, className = "", ...rest } = props;
  const customClass = [
    className,
    variant === "secondary" ? "ams-button--secondary" : "",
    variant === "ai" ? "ams-button--ai" : "",
    variant === "quaternary" ? "ams-button--quaternary" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const amsterdamVariant = variant === "ai" ? "secondary" : variant === "quaternary" ? "tertiary" : variant;
  // Cast AmsterdamButton to React.ComponentType<any> to satisfy TS
  const AmsterdamButtonComponent = AmsterdamButton as unknown as React.ComponentType<any>;
  return <AmsterdamButtonComponent ref={ref} className={customClass} variant={amsterdamVariant} {...rest} />;
});

Button.displayName = "Button"

export { Button }
