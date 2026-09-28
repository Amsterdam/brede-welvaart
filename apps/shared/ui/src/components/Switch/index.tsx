import * as React from "react";
import { Switch as AmsterdamSwitch } from "@amsterdam/design-system-react";
import "./switch.scss";

const Switch = React.forwardRef<HTMLElement, any>((props, ref) => {
  const { disabled, ...rest } = props;
  // Cast AmsterdamSwitch to React.ComponentType<any> to satisfy TS
  const AmsterdamSwitchComponent =
    AmsterdamSwitch as unknown as React.ComponentType<any>;
  return <AmsterdamSwitchComponent ref={ref} disabled={disabled} {...rest} />;
});

Switch.displayName = "Switch";

export { Switch };
