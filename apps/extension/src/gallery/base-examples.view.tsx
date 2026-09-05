import { vaultLockOptions } from "@/ui/lib/vault-lock-options";
import { Specimen } from "./specimen.view";
import type { CatalogId } from "./usage";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/ui/components/primitives/button";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/ui/components/primitives/field";
import { Input } from "@/ui/components/primitives/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/ui/components/primitives/input-group";
import { Textarea } from "@/ui/components/primitives/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/ui/components/primitives/native-select";
import { Checkbox } from "@/ui/components/primitives/checkbox";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/ui/components/primitives/radio-group";
import { Slider } from "@/ui/components/primitives/slider";
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/ui/components/primitives/alert";
import { Badge } from "@/ui/components/primitives/badge";
import { Spinner } from "@/ui/components/primitives/spinner";
import { Skeleton } from "@/ui/components/primitives/skeleton";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/ui/components/primitives/accordion";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/ui/components/primitives/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/ui/components/primitives/dropdown-menu";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/ui/components/primitives/alert-dialog";
import { Separator } from "@/ui/components/primitives/separator";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/ui/components/primitives/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/ui/components/primitives/tabs";

function Example({
  id,
  title,
  source,
  children,
}: {
  id: CatalogId;
  title: string;
  source: string;
  children: ReactNode;
}) {
  return (
    <Specimen
      id={id}
      name={title}
      owner={`@/ui/components/primitives/${source}`}
    >
      {children}
    </Specimen>
  );
}

export function BaseExamples() {
  const id = useId();
  const [length, setLength] = useState(14);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actions, setActions] = useState(0);
  return (
    <TooltipProvider>
      <Example id="B02" title="Field" source="field">
        <Field data-invalid>
          <FieldLabel htmlFor={`${id}-name`}>Example device name</FieldLabel>
          <Input
            id={`${id}-name`}
            defaultValue=""
            aria-invalid
            aria-describedby={`${id}-help ${id}-error`}
          />
          <FieldDescription id={`${id}-help`}>
            Use a name you recognize.
          </FieldDescription>
          <FieldError id={`${id}-error`}>
            Enter a name for this example.
          </FieldError>
        </Field>
      </Example>
      <Example id="B03" title="Input" source="input">
        <Field>
          <FieldLabel htmlFor={`${id}-login`}>Example login</FieldLabel>
          <Input id={`${id}-login`} defaultValue="demo@example.invalid" />
        </Field>
        <Input
          aria-label="Read-only input"
          readOnly
          value="Read-only example"
        />
        <Input aria-label="Disabled input" disabled placeholder="Disabled" />
      </Example>
      <Example id="B04" title="Input Group" source="input-group">
        <Field>
          <FieldLabel htmlFor={`${id}-url`}>Example address</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>https://</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput id={`${id}-url`} defaultValue="example.invalid" />
          </InputGroup>
        </Field>
      </Example>
      <Example id="B05" title="Textarea" source="textarea">
        <Field>
          <FieldLabel htmlFor={`${id}-text`}>Transfer text</FieldLabel>
          <Textarea
            id={`${id}-text`}
            defaultValue="Device enrollment request"
            spellCheck={false}
          />
        </Field>
      </Example>
      <Example id="B06" title="Native Select" source="native-select">
        <Field>
          <FieldLabel htmlFor={`${id}-duration`}>
            Example lock duration
          </FieldLabel>
          <NativeSelect id={`${id}-duration`} defaultValue={600_000}>
            {vaultLockOptions.map(({ value, label }) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </Example>
      <Example id="B07" title="Checkbox" source="checkbox">
        <Field orientation="horizontal">
          <FieldLabel id={`${id}-numbers-label`}>
            <Checkbox aria-labelledby={`${id}-numbers-label`} defaultChecked />
            Include numbers
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <FieldLabel id={`${id}-unavailable-label`}>
            <Checkbox aria-labelledby={`${id}-unavailable-label`} disabled />
            Unavailable example
          </FieldLabel>
        </Field>
      </Example>
      <Example id="B08" title="Radio Group" source="radio-group">
        <RadioGroup defaultValue="local" aria-label="Example resolution">
          <Field orientation="horizontal">
            <FieldLabel id={`${id}-local-label`}>
              <RadioGroupItem
                aria-labelledby={`${id}-local-label`}
                value="local"
              />
              Use local example
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <FieldLabel id={`${id}-remote-label`}>
              <RadioGroupItem
                aria-labelledby={`${id}-remote-label`}
                value="remote"
              />
              Use remote example
            </FieldLabel>
          </Field>
        </RadioGroup>
      </Example>
      <Example id="B09" title="Slider" source="slider">
        <Field>
          <FieldLabel htmlFor={`${id}-length`}>Example length</FieldLabel>
          <Input
            id={`${id}-length`}
            type="number"
            min={1}
            max={128}
            value={length}
            onChange={(event) => {
              const value = event.target.valueAsNumber;
              if (Number.isInteger(value) && value >= 1 && value <= 128)
                setLength(value);
            }}
          />
        </Field>
        <Slider
          aria-label="Example length slider"
          min={1}
          max={128}
          value={[length]}
          onValueChange={(value) =>
            setLength(Array.isArray(value) ? value[0] : value)
          }
        />
      </Example>
      <Example id="B10" title="Alert" source="alert">
        <Alert role="note">
          <AlertTitle>Keep your recovery words private</AlertTitle>
          <AlertDescription>
            Store them somewhere only you can access.
          </AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertTitle>Example operation failed</AlertTitle>
          <AlertDescription>
            Your example values are still available.
          </AlertDescription>
        </Alert>
      </Example>
      <Example id="B11" title="Badge" source="badge">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Error</Badge>
        </div>
      </Example>
      <Example id="B12" title="Spinner" source="spinner">
        <Button disabled>
          <Spinner />
          Working
        </Button>
      </Example>
      <Example id="B13" title="Skeleton" source="skeleton">
        <div
          role="status"
          aria-label="Loading example content"
          className="space-y-2"
        >
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Example>
      <Example id="B14" title="Accordion" source="accordion">
        <Accordion>
          <AccordionItem value="details">
            <AccordionTrigger>When does the vault lock?</AccordionTrigger>
            <AccordionContent>
              The lock timer starts when you unlock the vault.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Example>
      <Example id="B15" title="Tooltip" source="tooltip">
        <Tooltip>
          <TooltipTrigger render={<Button variant="outline" />}>
            Supplementary help
          </TooltipTrigger>
          <TooltipContent>
            Essential guidance stays visible in the form.
          </TooltipContent>
        </Tooltip>
      </Example>
      <Example id="B16" title="Dropdown Menu" source="dropdown-menu">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            Example actions
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setActions((count) => count + 1)}>
              Record example action
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Unavailable action</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Example>
      <Example id="B17" title="Alert Dialog" source="alert-dialog">
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger render={<Button variant="destructive" />}>
            Open confirmation
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset example actions?</AlertDialogTitle>
              <AlertDialogDescription>
                This clears only the gallery action count.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep examples</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setActions(0);
                  setConfirmOpen(false);
                }}
              >
                Reset count
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Example>
      <Example id="B18" title="Separator" source="separator">
        <p className="text-sm">First content group</p>
        <Separator />
        <p className="text-sm">Second content group</p>
      </Example>
      <Example id="B19" title="Dialog" source="dialog">
        <Dialog>
          <DialogTrigger render={<Button variant="outline" />}>
            Open example dialog
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Example details</DialogTitle>
              <DialogDescription>
                Review focus behavior with Tab and Escape.
              </DialogDescription>
            </DialogHeader>
            <Input
              aria-label="Dialog example value"
              defaultValue="Personal vault"
            />
          </DialogContent>
        </Dialog>
      </Example>
      <Example id="B20" title="Tabs" source="tabs">
        <Tabs defaultValue="password">
          <TabsList aria-label="Example generator mode">
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="username">Username</TabsTrigger>
          </TabsList>
          <TabsContent value="password">Password controls go here.</TabsContent>
          <TabsContent value="username">Username controls go here.</TabsContent>
        </Tabs>
      </Example>
      <p role="status" className="text-sm text-muted-foreground">
        Menu example actions: {actions}
      </p>
    </TooltipProvider>
  );
}
