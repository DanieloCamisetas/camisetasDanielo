import OrderBuilder from "./OrderBuilder";
import { readPatchOptions } from "./patches";

export default function Page() {
  return <OrderBuilder patchOptions={readPatchOptions()} />;
}
