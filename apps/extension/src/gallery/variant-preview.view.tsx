import { useId, useState, type ComponentProps, type ElementType } from "react";
import { componentApi } from "./component-api.generated";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/ui/components/primitives/native-select";
import { VariantDemo } from "./variant-demo.view";

export type PreviewProps = <T extends ElementType>(
  component: T,
  name: string,
) => Partial<ComponentProps<T>>;

export function VariantPreview({
  id,
  initialComponent,
}: {
  id: string;
  initialComponent?: string;
}) {
  const components = componentApi.filter(
    (c) => c.family === id && Object.keys(c.axes).length > 0,
  );
  const [selected, setSelected] = useState<string>(
    components.find((c) => c.name === initialComponent)?.name ??
      components[0]?.name ??
      "",
  );
  const [choices, setChoices] = useState<Record<string, string>>({});
  const member:
    | { name: string; axes: Readonly<Record<string, readonly string[]>> }
    | undefined = components.find((c) => c.name === selected);
  const formId = useId();
  if (!member)
    return (
      <>
        <p className="text-xs text-muted-foreground">
          Single presentation. Review behavior states in the example above.
        </p>
        <VariantDemo id={id} propsFor={() => ({})} />
      </>
    );
  // Values come only from the compiler-generated string-literal API inventory.
  const values = Object.fromEntries(
    Object.entries(member.axes).map(([axis, options]) => {
      const defaults: Record<string, string> = {
        variant: "default",
        size: "default",
        orientation: "horizontal",
        side: "bottom",
        align: "center",
        collapsible: "icon",
        mode: "add",
      };
      return [
        axis,
        choices[axis] ??
          (options.includes(defaults[axis]) ? defaults[axis] : options[0]),
      ];
    }),
  );
  function props<T extends ElementType>(
    _component: T,
    name: string,
  ): Partial<ComponentProps<T>> {
    return (name === selected ? values : {}) as Partial<ComponentProps<T>>;
  }
  return (
    <div data-gallery-variants={id} className="space-y-4 border-t pt-5">
      <p className="text-sm font-medium">Variant preview</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          Component
          <NativeSelect
            aria-label={`${id} variant component`}
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setChoices({});
            }}
          >
            {components.map((c) => (
              <NativeSelectOption key={c.name} value={c.name}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        {Object.entries(member.axes).map(([axis, options]) => (
          <label
            key={axis}
            htmlFor={`${formId}-${axis}`}
            className="space-y-1 text-xs text-muted-foreground"
          >
            {axis}
            <NativeSelect
              id={`${formId}-${axis}`}
              aria-label={`${member.name} ${axis}`}
              data-gallery-axis={axis}
              value={values[axis]}
              onChange={(e) =>
                setChoices({ ...choices, [axis]: e.target.value })
              }
            >
              {options.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        ))}
      </div>
      <p data-gallery-selection className="text-xs text-muted-foreground">
        {member.name}:{" "}
        {Object.entries(values)
          .map(([key, value]) => `${key}=${value}`)
          .join(" · ")}
      </p>
      <div
        data-gallery-variant-demo
        className="min-w-0 space-y-3"
        key={JSON.stringify([selected, values])}
      >
        <VariantDemo id={id} propsFor={props} />
      </div>
    </div>
  );
}
