import { createGenuiLibrary, type GenuiName, type GenuiProps } from "@flai/shared/genui"
import {
  type ComponentRenderer,
  FormNameContext,
  useFormName,
  useGetFieldValue,
  useIsStreaming,
  useRenderNode,
  useSetFieldValue,
  useTriggerAction,
} from "@openuidev/react-lang"
import { cn } from "cn"
import { ArrowDownRightIcon, ArrowUpRightIcon, CircleAlertIcon, CircleCheckIcon, InfoIcon, MinusIcon, TriangleAlertIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Checkbox } from "~/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table"
import { Textarea } from "~/components/ui/textarea"
import { Markdown } from "../markdown"
import { BarChartView, cleanLabels, cleanSeries, cleanSlices, LineChartView, PieChartView } from "./charts"

type R<N extends GenuiName> = ComponentRenderer<GenuiProps<N>>

const Children = ({ items }: { items?: unknown[] }) => {
  const renderNode = useRenderNode()
  return <>{(items ?? []).map((item, i) => <div key={i} className="min-w-0">{renderNode(item)}</div>)}</>
}

const toneIcon = { default: InfoIcon, info: InfoIcon, success: CircleCheckIcon, warning: TriangleAlertIcon, danger: CircleAlertIcon }

const Stack: R<"Stack"> = ({ props }) => (
  <div className={cn("flex min-w-0 gap-3", props.direction === "horizontal" ? "flex-row flex-wrap items-start" : "flex-col")}>
    <Children items={props.children} />
  </div>
)

const CardView: R<"Card"> = ({ props }) => (
  <Card size="sm">
    {(props.title || props.description) && (
      <CardHeader>
        {props.title && <CardTitle>{props.title}</CardTitle>}
        {props.description && <CardDescription>{props.description}</CardDescription>}
      </CardHeader>
    )}
    {props.children?.length ? (
      <CardContent className="flex flex-col gap-3">
        <Children items={props.children} />
      </CardContent>
    ) : null}
  </Card>
)

const Text: R<"Text"> = ({ props }) => <Markdown light>{props.content ?? ""}</Markdown>

const Callout: R<"Callout"> = ({ props }) => {
  const Icon = toneIcon[props.tone ?? "default"]
  return (
    <Alert variant={props.tone === "danger" ? "destructive" : "default"}>
      <Icon />
      {props.title && <AlertTitle>{props.title}</AlertTitle>}
      <AlertDescription>
        <Markdown light>{props.content ?? ""}</Markdown>
      </AlertDescription>
    </Alert>
  )
}

const Badges: R<"Badges"> = ({ props }) => (
  <div className="flex flex-wrap gap-1.5">
    {(props.items ?? []).filter(Boolean).map((item, i) => (
      <Badge key={i} variant={props.tone === "danger" ? "destructive" : props.tone && props.tone !== "default" ? "outline" : "secondary"}>
        {item}
      </Badge>
    ))}
  </div>
)

const KeyValue: R<"KeyValue"> = ({ props }) => (
  <dl className="grid grid-cols-[minmax(0,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
    {(props.items ?? []).filter(Boolean).map((item, i) => (
      <div key={i} className="contents">
        <dt className="text-muted-foreground">{item.label}</dt>
        <dd className="min-w-0 break-words">{item.value}</dd>
      </div>
    ))}
  </dl>
)

const Stat: R<"Stat"> = ({ props }) => {
  const TrendIcon = props.trend === "up" ? ArrowUpRightIcon : props.trend === "down" ? ArrowDownRightIcon : MinusIcon
  return (
    <div className="flex min-w-36 flex-col gap-2 rounded-sm border-t-2 border-foreground p-4 pl-0">
      <span className="text-xs tracking-wide text-muted-foreground uppercase">{props.label}</span>
      <span className="text-3xl leading-none font-light tracking-tight tabular-nums">{props.value}</span>
      {props.change && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <TrendIcon className="size-3.5" />
          {props.change}
        </span>
      )}
    </div>
  )
}

const TableView: R<"Table"> = ({ props }) => (
  <div className="overflow-x-auto rounded-lg border">
    <Table>
      <TableHeader>
        <TableRow>
          {(props.columns ?? []).map((c, i) => (
            <TableHead key={i}>{c}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {(props.rows ?? []).filter(Array.isArray).map((row, i) => (
          <TableRow key={i}>
            {(props.columns ?? []).map((_, j) => (
              <TableCell key={j} className={typeof row?.[j] === "number" ? "text-right tabular-nums" : undefined}>
                {row?.[j] ?? ""}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
)

const Steps: R<"Steps"> = ({ props }) => (
  <ol className="flex flex-col gap-3">
    {(props.items ?? []).filter(Boolean).map((step, i) => (
      <li key={i} className="flex gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{i + 1}</span>
        <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
          <span className="text-sm font-medium">{step.title}</span>
          {step.description && <span className="text-sm text-muted-foreground">{step.description}</span>}
        </div>
      </li>
    ))}
  </ol>
)

const BarChart: R<"BarChart"> = ({ props }) => (
  <BarChartView labels={cleanLabels(props.labels)} series={cleanSeries(props.series)} stacked={props.stacked} />
)
const LineChart: R<"LineChart"> = ({ props }) => <LineChartView labels={cleanLabels(props.labels)} series={cleanSeries(props.series)} />
const PieChart: R<"PieChart"> = ({ props }) => <PieChartView slices={cleanSlices(props.slices)} />

const ButtonView: R<"Button"> = ({ props }) => {
  const trigger = useTriggerAction()
  const formName = useFormName()
  const streaming = useIsStreaming()
  return (
    <Button
      variant={props.variant === "secondary" ? "outline" : "default"}
      disabled={streaming}
      onClick={() => void trigger(props.label, formName, props.action as never)}
    >
      {props.label}
    </Button>
  )
}

const Form: R<"Form"> = ({ props }) => {
  const trigger = useTriggerAction()
  const streaming = useIsStreaming()
  return (
    <FormNameContext.Provider value={props.name}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void trigger(props.submitLabel ?? "Submit", props.name)
        }}
      >
        <FieldGroup>
          <Children items={props.fields} />
        </FieldGroup>
        <Button type="submit" className="self-start" disabled={streaming}>
          {props.submitLabel ?? "Submit"}
        </Button>
      </form>
    </FormNameContext.Provider>
  )
}

function useField(componentType: string, name: string) {
  const formName = useFormName()
  const get = useGetFieldValue()
  const set = useSetFieldValue()
  return [get(formName, name), (value: unknown) => set(formName, componentType, name, value)] as const
}

const InputView: R<"Input"> = ({ props }) => {
  const [value, setValue] = useField("Input", props.name)
  const id = `genui-${props.name}`
  const Control = props.multiline ? Textarea : Input
  return (
    <Field>
      <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
      <Control
        id={id}
        required={props.required}
        placeholder={props.placeholder}
        value={(value as string | undefined) ?? ""}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue(e.target.value)}
      />
    </Field>
  )
}

const SelectView: R<"Select"> = ({ props }) => {
  const [value, setValue] = useField("Select", props.name)
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      <Select value={(value as string | undefined) ?? null} onValueChange={(v) => setValue(v)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={props.label} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {(props.options ?? []).filter(Boolean).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}

const CheckboxView: R<"Checkbox"> = ({ props }) => {
  const [value, setValue] = useField("Checkbox", props.name)
  const id = `genui-${props.name}`
  return (
    <Field orientation="horizontal">
      <Checkbox id={id} checked={Boolean(value)} onCheckedChange={(checked) => setValue(checked)} />
      <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
    </Field>
  )
}

export const genuiLibrary = createGenuiLibrary<ComponentRenderer<any>>({
  Stack,
  Card: CardView,
  Text,
  Callout,
  Badges,
  KeyValue,
  Stat,
  Table: TableView,
  Steps,
  BarChart,
  LineChart,
  PieChart,
  Button: ButtonView,
  Form,
  Input: InputView,
  Select: SelectView,
  Checkbox: CheckboxView,
})
