import { workingToolExample } from "~/components/genui/prompt-examples"

export interface GenuiSample {
  title: string
  /** Components this sample demonstrates. */
  components: string[]
  code: string
}

export interface GenuiSampleGroup {
  name: string
  /** Whether the group is part of the curated set advertised in the chat prompt. */
  advertised: boolean
  samples: GenuiSample[]
}

// Real Wikimedia thumbnails, as image_search returns them.
const wiki = (path: string) =>
  `https://thumb.wikimedia.org/wikipedia/commons/thumb/${path}`
const tower = wiki(
  "6/65/Torre_Bel%C3%A9m_April_2009-4a.jpg/960px-Torre_Bel%C3%A9m_April_2009-4a.jpg"
)
const pena = wiki(
  "3/3e/Sintra_-_Palacio_da_Pena_%2820332995770%29.jpg/960px-Sintra_-_Palacio_da_Pena_%2820332995770%29.jpg"
)
const nata = wiki("0/0c/Pasteis_de_Belem.jpg/960px-Pasteis_de_Belem.jpg")
const monastery = wiki(
  "0/0e/1502_legte_K%C3%B6nig_Manuel_I._den_Grundstein_f%C3%BCr_das_Hieronymus_Kloster_in_Lissabon._06.jpg/960px-1502_legte_K%C3%B6nig_Manuel_I._den_Grundstein_f%C3%BCr_das_Hieronymus_Kloster_in_Lissabon._06.jpg"
)

const img = (seed: string, w = 480, h = 320) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`

// Groups mirror the prompt's componentGroups (scripts/generate-genui-spec.mjs), then the render-only rest.
export const sampleGroups: GenuiSampleGroup[] = [
  {
    name: "Layout",
    advertised: true,
    samples: [
      {
        title: "Stack",
        components: ["Stack"],
        code: `root = Stack([row, col])
row = Stack([TextContent("Row A"), TextContent("Row B"), TextContent("Row C")], "row", "l")
col = Stack([TextContent("Column 1"), TextContent("Column 2")], "column", "s")`,
      },
      {
        title: "Card variants",
        components: ["Card", "CardHeader"],
        code: `root = Stack([a, b, c], "row", "m", "stretch", "start", true)
a = Card([CardHeader("Card", "variant: card"), TextContent("Elevated container.")])
b = Card([CardHeader("Sunk", "variant: sunk"), TextContent("Recessed container.")], "sunk")
c = Card([CardHeader("Clear", "variant: clear"), TextContent("No background.")], "clear")`,
      },
      {
        title: "Tabs",
        components: ["Tabs", "TabItem"],
        code: `root = Stack([tabs])
tabs = Tabs([t1, t2])
t1 = TabItem("react", "React", [TextContent("A library by Meta for building UIs."), Callout("info", "Note", "React uses JSX syntax.")])
t2 = TabItem("vue", "Vue", [TextContent("A progressive framework by Evan You."), Callout("success", "Tip", "Vue has a gentle learning curve.")])`,
      },
      {
        title: "Accordion",
        components: ["Accordion", "AccordionItem"],
        code: `root = Stack([acc])
acc = Accordion([a1, a2])
a1 = AccordionItem("what", "What is OpenUI?", [TextContent("A declarative language for generative UI.")])
a2 = AccordionItem("how", "How is it rendered?", [TextContent("The Renderer parses the program and maps calls to React components.")])`,
      },
      {
        title: "Separator",
        components: ["Separator"],
        code: `root = Stack([TextContent("Above"), Separator(), TextContent("Below")])`,
      },
    ],
  },
  {
    name: "Content",
    advertised: true,
    samples: [
      {
        title: "TextContent sizes",
        components: ["TextContent"],
        code: `root = Stack([a, b, c, d, e])
a = TextContent("large-heavy", "large-heavy")
b = TextContent("large", "large")
c = TextContent("default with **markdown** and \`code\`")
d = TextContent("small-heavy", "small-heavy")
e = TextContent("small", "small")`,
      },
      {
        title: "Callout",
        components: ["Callout"],
        code: `root = Stack([a, b, c, d, e])
a = Callout("info", "Info", "Something worth knowing.")
b = Callout("success", "Success", "The task finished.")
c = Callout("warning", "Warning", "Double-check this value.")
d = Callout("error", "Error", "The request failed.")
e = Callout("neutral", "Neutral", "A plain note.")`,
      },
      {
        title: "CodeBlock",
        components: ["CodeBlock"],
        code: `root = Stack([code])
code = CodeBlock("ts", "export function add(a: number, b: number) {\\n  return a + b\\n}")`,
      },
      {
        title: "Image",
        components: ["Image"],
        code: `root = Stack([Image("Mountain", "${img("flai-mountain", 720, 360)}")])`,
      },
      {
        title: "ImageGallery",
        components: ["ImageGallery"],
        code: `root = Stack([gallery])
gallery = ImageGallery([{src: "${img("flai-a")}", alt: "A", details: "First"}, {src: "${img("flai-b")}", alt: "B", details: "Second"}, {src: "${img("flai-c")}", alt: "C", details: "Third"}, {src: "${img("flai-d")}", alt: "D"}])`,
      },
    ],
  },
  {
    name: "Data",
    advertised: true,
    samples: [
      {
        title: "Table",
        components: ["Table", "Col"],
        code: `root = Stack([tbl])
tbl = Table([Col("Language", langs), Col("Users (M)", users, "number"), Col("Year", years, "number")])
langs = ["Python", "JavaScript", "Java", "TypeScript", "Go"]
users = [15.7, 14.2, 12.1, 8.5, 5.2]
years = [1991, 1995, 1995, 2012, 2009]`,
      },
      {
        title: "BarChart",
        components: ["BarChart", "Series"],
        code: `root = Stack([grouped, stacked])
grouped = BarChart(labels, [s1, s2], "grouped", "Month", "Revenue")
stacked = BarChart(labels, [s1, s2], "stacked")
labels = ["Oct", "Nov", "Dec"]
s1 = Series("Product A", [120, 150, 180])
s2 = Series("Product B", [90, 110, 140])`,
      },
      {
        title: "LineChart",
        components: ["LineChart", "Series"],
        code: `root = Stack([chart])
chart = LineChart(["Mon", "Tue", "Wed", "Thu", "Fri"], [Series("Visits", [320, 410, 380, 520, 610]), Series("Signups", [40, 52, 47, 70, 88])], "natural")`,
      },
      {
        title: "PieChart",
        components: ["PieChart"],
        code: `root = Stack([pie, donut, semi], "row", "m", "start", "start", true)
labels = ["Chrome", "Safari", "Firefox", "Other"]
values = [64, 19, 4, 13]
pie = PieChart(labels, values, "pie")
donut = PieChart(labels, values, "donut")
semi = PieChart(labels, values, "donut", "semiCircular")`,
      },
    ],
  },
  {
    name: "Forms",
    advertised: true,
    samples: [
      {
        title: "Inputs",
        components: [
          "Form",
          "FormControl",
          "Input",
          "TextArea",
          "Select",
          "SelectItem",
          "DatePicker",
        ],
        code: `root = Stack([form])
form = Form("contact", btns, [nameField, emailField, countryField, dateField, msgField])
nameField = FormControl("Name", Input("name", "Your name", "text", { required: true, minLength: 2 }))
emailField = FormControl("Email", Input("email", "you@example.com", "email", { required: true, email: true }), "We never share it.")
countryField = FormControl("Country", Select("country", [SelectItem("us", "United States"), SelectItem("uk", "United Kingdom"), SelectItem("de", "Germany")], "Select..."))
dateField = FormControl("Trip dates", DatePicker("dates", "range"))
msgField = FormControl("Message", TextArea("message", "Tell us more...", 4))
btns = Buttons([Button("Submit", @ToAssistant("Submit"), "primary"), Button("Cancel", @ToAssistant("Cancel"), "secondary")])`,
      },
      {
        title: "Choices",
        components: [
          "CheckBoxGroup",
          "CheckBoxItem",
          "RadioGroup",
          "RadioItem",
        ],
        code: `root = Stack([form])
form = Form("prefs", Buttons([Button("Save", @ToAssistant("Save"), "primary")]), [plan, extras])
plan = FormControl("Plan", RadioGroup("plan", [RadioItem("Free", "For trying things out", "free"), RadioItem("Pro", "For daily use", "pro")], "pro"))
extras = FormControl("Extras", CheckBoxGroup("extras", [CheckBoxItem("Newsletter", "Monthly updates", "news", true), CheckBoxItem("Beta", "Try features early", "beta")]))`,
      },
    ],
  },
  {
    name: "Actions",
    advertised: true,
    samples: [
      {
        title: "Button variants",
        components: ["Button", "Buttons"],
        code: `root = Stack([row, sizes, col])
row = Buttons([Button("Primary", @ToAssistant("Primary"), "primary"), Button("Secondary", @ToAssistant("Secondary"), "secondary"), Button("Tertiary", @ToAssistant("Tertiary"), "tertiary"), Button("Delete", @ToAssistant("Delete"), "primary", "destructive")])
sizes = Buttons([Button("XS", @ToAssistant("XS"), "secondary", "normal", "extra-small"), Button("S", @ToAssistant("S"), "secondary", "normal", "small"), Button("M", @ToAssistant("M"), "secondary", "normal", "medium"), Button("L", @ToAssistant("L"), "secondary", "normal", "large")])
col = Buttons([Button("Stacked one", @ToAssistant("One"), "secondary"), Button("Stacked two", @ToAssistant("Two"), "secondary")], "column")`,
      },
    ],
  },
  {
    name: "Media",
    advertised: true,
    samples: [
      {
        title: "MediaCard grid",
        components: ["MediaCard"],
        code: `root = Stack([a, b, c], "row", "m", "stretch", "start", true)
a = MediaCard("${tower}", "Belém Tower", "Belém Tower", "A 16th-century fort on the Tagus; climb it at opening time.", ["Belém", "€8"])
b = MediaCard("${pena}", "Pena Palace", "Pena Palace", "Romanticist palace above Sintra, best on a clear morning.", ["Sintra", "€20"])
c = MediaCard("${monastery}", "Jerónimos Monastery", "Jerónimos Monastery", "Manueline cloisters next to the tower.", ["Belém", "€12"])`,
      },
      {
        title: "MediaCard horizontal",
        components: ["MediaCard"],
        code: `root = Stack([d1, d2])
d1 = MediaCard("${tower}", "Belém Tower", "Day 1 · Belém", "Start at the tower, walk to the monastery, then queue for pastéis de Belém.", ["Tram 15"], "horizontal")
d2 = MediaCard("${pena}", "Pena Palace", "Day 2 · Sintra", "Train from Rossio, then the 434 bus up the hill. Book the 9 AM slot.", ["Train 40 min", "Bus 434"], "horizontal")`,
      },
      {
        title: "Carousel",
        components: ["Carousel"],
        code: `root = Stack([Carousel([[MediaCard("${tower}", "Belém Tower", "Belém Tower", null, ["Fort"])], [MediaCard("${pena}", "Pena Palace", "Pena Palace", null, ["Palace"])], [MediaCard("${nata}", "Pastel de nata", "Pastel de nata", null, ["Food"], null, 1.5)], [Image("Jerónimos Monastery", "${monastery}"), TextContent("A plain Image slide", "small")]])])`,
      },
      {
        title: "ListBlock",
        components: ["ListBlock", "ListItem"],
        code: `root = Stack([photos, steps], "column", "l")
photos = ListBlock([ListItem("Belém Tower", "16th-century fort on the Tagus", {src: "${tower}", alt: "Belém Tower"}), ListItem("Pena Palace", "Romanticist palace above Sintra", {src: "${pena}", alt: "Pena Palace"}, "Tickets", @ToAssistant("Find Pena Palace tickets")), ListItem("Pastel de nata", "Custard tart, best warm", {src: "${nata}", alt: "Pastel de nata"})], "image")
steps = ListBlock([ListItem("Read the spec", "10 min"), ListItem("Build the prototype", "2 h"), ListItem("Review", "30 min")], "number", "small")`,
      },
      {
        title: "HtmlView",
        components: ["HtmlView"],
        code: `root = Stack([TextContent("Click the canvas to add a ball.", "small"), game])
game = HtmlView("<canvas id='c' style='display:block;width:100%;height:240px'></canvas><script>const c=document.getElementById('c'),x=c.getContext('2d');const balls=[{x:40,y:40,vx:2.4,vy:1.7,r:14}];function size(){c.width=c.clientWidth;c.height=c.clientHeight}size();addEventListener('resize',size);c.addEventListener('click',e=>balls.push({x:e.offsetX,y:e.offsetY,vx:(Math.random()-.5)*6,vy:(Math.random()-.5)*6,r:8+Math.random()*12}));function tick(){x.clearRect(0,0,c.width,c.height);for(const b of balls){b.x+=b.vx;b.y+=b.vy;if(b.x<b.r||b.x>c.width-b.r)b.vx*=-1;if(b.y<b.r||b.y>c.height-b.r)b.vy*=-1;x.beginPath();x.arc(b.x,b.y,b.r,0,7);x.fillStyle='#003b8e';x.fill()}requestAnimationFrame(tick)}tick()</script>", null, "Bouncing balls")`,
      },
    ],
  },
  {
    name: "Drawing",
    advertised: true,
    samples: [
      {
        title: "Shapes",
        components: [
          "Svg",
          "G",
          "Circle",
          "Ellipse",
          "Rect",
          "Line",
          "Path",
          "Polyline",
          "Polygon",
          "SvgText",
        ],
        code: `root = Stack([Svg([box, dot, oval, arrow, head, wave, spark, tilted, label], "0 0 240 140")])
box = Rect(12, 16, 60, 40, "surface", "ink", 2, null, 4)
dot = Circle(108, 36, 20, "brand")
oval = Ellipse(176, 36, 36, 18, null, "muted", 2)
arrow = Line(12, 90, 84, 90, "ink", 2)
head = Polygon("92,90 82,84 82,96", "ink")
wave = Path("M104 90 C 124 66, 144 114, 164 90", null, "brand", 3)
spark = Polyline("176,100 190,80 204,94 220,72", "danger", 2)
tilted = G([Rect(60, 104, 40, 20, "chart3")], "rotate(-12 80 114)")
label = SvgText("Rect · Circle · Ellipse · Line · Path · Polyline · G", 120, 136, 9, "muted", "middle")`,
      },
      {
        title: "State-driven steps",
        components: ["Svg", "Rect", "Circle", "SvgText", "@Clamp", "@Percent"],
        code: `root = Stack([title, card])
$step = 0
title = TextContent("Assemble a shelf", "large-heavy")
card = Card([CardHeader(steps[$step].title, "Step " + ($step + 1) + " of 3 · " + @Round(@Percent($step + 1, 3)) + "% done"), drawings[$step], TextContent(steps[$step].text, "small"), nav])
nav = Buttons([Button("Back", @Set($step, @Clamp($step - 1, 0, 2)), "secondary"), Button("Next", @Set($step, @Clamp($step + 1, 0, 2)), "primary")])
steps = [{title: "Lay out the parts", text: "Two sides, a top and a shelf."}, {title: "Fix the boards", text: "Push the top and shelf onto one side's dowels."}, {title: "Add the other side", text: "Fit the second side and tighten the cam locks."}]
s0 = Svg([Rect(16, 20, 22, 110, "surface", "ink", 2), Rect(48, 20, 22, 110, "surface", "ink", 2), Rect(100, 30, 120, 16, "surface", "ink", 2), Rect(100, 76, 120, 16, "surface", "ink", 2), SvgText("Sides", 43, 146, 11, "muted", "middle"), SvgText("Top + shelf", 160, 116, 11, "muted", "middle")], "0 0 240 150")
s1 = Svg([Rect(40, 16, 18, 120, "surface", "ink", 2), Rect(58, 16, 130, 14, "surface", "ink", 2), Rect(58, 76, 130, 14, "surface", "ink", 2), Circle(68, 23, 4, "brand"), Circle(68, 83, 4, "brand")], "0 0 240 150")
s2 = Svg([Rect(40, 16, 18, 120, "surface", "ink", 2), Rect(58, 16, 130, 14, "surface", "ink", 2), Rect(58, 76, 130, 14, "surface", "ink", 2), Rect(188, 16, 18, 120, "surface", "brand", 2), SvgText("Cam lock", 120, 112, 11, "brand", "middle")], "0 0 240 150")
drawings = [s0, s1, s2]`,
      },
    ],
  },
  {
    name: "Functions",
    advertised: true,
    samples: [
      {
        title: "Prompt example: working tool",
        components: ["Input", "@Clamp", "@Default", "@Plural", "@Format"],
        code: workingToolExample,
      },
      {
        title: "Scale a shopping list",
        components: ["@Clamp", "@Plural", "@Round", "@Each", "@Join"],
        code: `root = Stack([title, stepper, list, summary])
$guests = 4
title = TextContent("Pasta night for " + @Plural($guests, "guest"), "large-heavy")
stepper = Buttons([Button("−", @Set($guests, @Clamp($guests - 1, 1, 20)), "secondary"), Button("+", @Set($guests, @Clamp($guests + 1, 1, 20)), "secondary")])
lines = @Each(base, "i", @Round(i.qty * $guests / 4) + i.unit + " " + i.name)
list = Table([Col("Item", base.name), Col("Amount", @Each(base, "i", @Round(i.qty * $guests / 4) + i.unit))])
summary = TextContent("Copy: " + @Join(lines, "; "), "small")
base = [{name: "spaghetti", qty: 400, unit: " g"}, {name: "tomatoes", qty: 6, unit: ""}, {name: "parmesan", qty: 80, unit: " g"}]`,
      },
      {
        title: "Loan and split",
        components: ["@Payment", "@Format", "@Allocate", "@Convert", "@Pow"],
        code: `root = Stack([title, terms, result, split, units])
$years = 30
title = TextContent("$300,000 at 6%", "large-heavy")
terms = Buttons([Button("15 years", @Set($years, 15), $years == 15 ? "primary" : "secondary"), Button("30 years", @Set($years, 30), $years == 30 ? "primary" : "secondary")])
monthly = @Payment(300000, 6 / 12, $years * 12)
result = Callout("info", @Format(monthly, "currency") + " a month", "Total paid " + @Format(monthly * $years * 12, "compact", 1, "USD"))
split = TextContent("$100 split three ways: " + @Join(@Allocate(100, [1, 1, 1]), " + "))
units = TextContent("5 km = " + @Format(@Convert(5, "km", "mi"), "number", 2) + " mi · 2^10 = " + @Pow(2, 10), "small")`,
      },
      {
        title: "Dates and durations",
        components: [
          "@Today",
          "@AddDays",
          "@AddMonths",
          "@FormatDate",
          "@DaysBetween",
          "@StartOf",
          "@Duration",
        ],
        code: `root = Stack([tbl])
today = @Today()
tbl = Table([Col("Expression", labels), Col("Result", values)])
labels = ["@Today()", "long", "+10 days", "+1 month from Jan 31", "Days until New Year", "Start of week", "@Duration(4925)", "clock"]
values = [today, @FormatDate(today, "long"), @FormatDate(@AddDays(today, 10)), @AddMonths("2026-01-31", 1), @DaysBetween(today, "2027-01-01") + "", @StartOf(today, "week"), @Duration(4925), @Duration(4925, "clock")]`,
      },
      {
        title: "Lists and text",
        components: [
          "@Toggle",
          "@Includes",
          "@Range",
          "@Chunk",
          "@Shuffle",
          "@Capitalize",
          "@Split",
          "@SliceOf",
        ],
        code: `root = Stack([picks, chosen, deck, misc])
$picked = ["Tea"]
$deck = [1, 2, 3, 4, 5, 6]
picks = Buttons(@Each(["Tea", "Coffee", "Juice"], "d", Button(d, @Set($picked, @Toggle($picked, d)), @Includes($picked, d) ? "primary" : "secondary")))
chosen = TextContent("Picked: " + (@Count($picked) > 0 ? @Join($picked) : "nothing"))
deck = Buttons([Button("Shuffle " + @Join($deck, " "), @Set($deck, @Shuffle($deck)), "tertiary")])
misc = TextContent(@Capitalize("new york city") + " · " + @Join(@Split("a, b,,c"), "|") + " · " + @SliceOf("Saturday", 0, 3) + " · " + @Count(@Chunk(@Range(0, 10), 3)) + " chunks", "small")`,
      },
      {
        title: "Everything else",
        components: [
          "@Append",
          "@Prepend",
          "@Concat",
          "@Remove",
          "@RemoveAt",
          "@Update",
          "@Find",
          "@IndexOf",
          "@Take",
          "@Unique",
          "@Reverse",
          "@Pick",
          "@Flatten",
          "@Sqrt",
          "@Random",
          "@Lerp",
          "@Pad",
          "@Upper",
          "@Lower",
          "@Trim",
          "@Replace",
          "@Default",
          "@Now",
          "@MonthsBetween",
        ],
        code: `root = Stack([tbl, roll])
$roll = 0
$drawn = null
roll = Buttons([Button("Roll: " + $roll + " · drew " + @Default($drawn, "—"), Action([@Set($roll, @Random(1, 6, true)), @Set($drawn, @Pick(["red", "green", "blue"]))]), "secondary")])
tbl = Table([Col("Expression", exprs), Col("Result", results)])
people = [{id: 1, name: "Ann", age: 30}, {id: 2, name: "Bo", age: 25}]
exprs = ["@Append / @Prepend / @Concat", "@Remove / @RemoveAt", "@Update", "@Find / @IndexOf", "@Take / @Unique / @Reverse", "@Flatten", "@Sqrt / @Lerp", "@Pad", "@Upper / @Lower / @Trim", "@Replace", "@Default", "@Now", "@MonthsBetween"]
results = [@Join(@Concat(@Prepend(@Append([2], 3), 1), [4])), @Join(@RemoveAt(@Remove([1, 2, 3, 2], "", 2), 0)), @Join(@Update(people, "id", 2, "age", 26), "; ", "age"), @Find(people, "name", "Bo").age + " / " + @IndexOf(["a", "b"], "b"), @Join(@Reverse(@Unique(@Take([1, 1, 2, 3, 3], 4)))), @Join(@Flatten([[1, 2], [3]])), @Sqrt(81) + " / " + @Lerp(0, 10, 0.25), @Pad(7, 3), @Upper("a") + @Lower("B") + "[" + @Trim("  c  ") + "]", @Replace("a-b-c", "-", "/"), @Default(null, "fallback"), @SliceOf(@Now(), 0, 16), @MonthsBetween("2000-02-15", "2026-10-22") + ""]`,
      },
    ],
  },
  {
    name: "Layout (render-only)",
    advertised: false,
    samples: [
      {
        title: "Steps",
        components: ["Steps", "StepsItem"],
        code: `root = Stack([Steps([StepsItem("Install", "pnpm install"), StepsItem("Configure", "Copy .env.example to .env"), StepsItem("Run", "pnpm dev")])])`,
      },
      {
        title: "Modal",
        components: ["Modal"],
        code: `$open = false
root = Stack([Buttons([Button("Open modal", Action([@Set($open, true)]), "primary")]), modal])
modal = Modal("Hello", $open, [TextContent("Content rendered inside a modal.")], "md")`,
      },
    ],
  },
  {
    name: "Content (render-only)",
    advertised: false,
    samples: [
      {
        title: "MarkDownRenderer",
        components: ["MarkDownRenderer"],
        code: `root = Stack([MarkDownRenderer("### Heading\\n- **bold** item\\n- [link](https://example.com)\\n\\n> quote", "card")])`,
      },
      {
        title: "TextCallout",
        components: ["TextCallout"],
        code: `root = Stack([TextCallout("info", "Info", "Text callout."), TextCallout("warning", "Warning", "Careful."), TextCallout("danger", "Danger", "Destructive.")])`,
      },
      {
        title: "InlineHeader",
        components: ["InlineHeader"],
        code: `root = Stack([InlineHeader("Quarterly report", "Numbers for Q3 2026")])`,
      },
      {
        title: "ImageBlock",
        components: ["ImageBlock"],
        code: `root = Stack([ImageBlock("${img("flai-block", 720, 360)}", "Landscape")])`,
      },
    ],
  },
  {
    name: "Charts (render-only)",
    advertised: false,
    samples: [
      {
        title: "AreaChart",
        components: ["AreaChart"],
        code: `root = Stack([AreaChart(["Q1", "Q2", "Q3", "Q4"], [Series("2025", [30, 45, 40, 60]), Series("2026", [40, 55, 62, 80])], "natural")])`,
      },
      {
        title: "HorizontalBarChart",
        components: ["HorizontalBarChart"],
        code: `root = Stack([HorizontalBarChart(["Rust", "Go", "Python"], [Series("Stars (k)", [92, 120, 60])])])`,
      },
      {
        title: "RadarChart",
        components: ["RadarChart"],
        code: `root = Stack([RadarChart(["Speed", "Power", "Range", "Comfort", "Price"], [Series("Model A", [80, 70, 60, 90, 50]), Series("Model B", [60, 90, 80, 50, 70])])])`,
      },
      {
        title: "RadialChart / SingleStackedBarChart",
        components: ["RadialChart", "SingleStackedBarChart"],
        code: `root = Stack([RadialChart(labels, values), SingleStackedBarChart(labels, values)])
labels = ["Done", "In progress", "Todo"]
values = [12, 5, 8]`,
      },
      {
        title: "Slice",
        components: ["Slice"],
        code: `root = Stack([note, Slice("Done", 12), Slice("Todo", 8)])
note = TextContent("Slice is a data node: no other signature accepts it and it draws nothing on its own.", "small")`,
      },
      {
        title: "ScatterChart",
        components: ["ScatterChart", "ScatterSeries", "Point"],
        code: `root = Stack([ScatterChart([a, b], "Height", "Weight")])
a = ScatterSeries("Group A", [Point(160, 55), Point(170, 65), Point(175, 72), Point(182, 80)])
b = ScatterSeries("Group B", [Point(150, 48), Point(158, 52), Point(165, 60), Point(168, 58)])`,
      },
    ],
  },
  {
    name: "Tables (render-only)",
    advertised: false,
    samples: [
      {
        title: "EditableTable",
        components: ["EditableTable"],
        code: `root = Stack([EditableTable("tasks", [{type: "text", key: "task", header: "Task"}, {type: "number", key: "hours", header: "Hours"}, {type: "select", key: "status", header: "Status", options: [{value: "todo", label: "Todo"}, {value: "done", label: "Done"}]}], [{id: "1", values: ["Write docs", 3, "todo"]}, {id: "2", values: ["Ship it", 1, "done"]}])])`,
      },
    ],
  },
  {
    name: "Forms (render-only)",
    advertised: false,
    samples: [
      {
        title: "Slider / Switch / Chips / OptionCards",
        components: [
          "Label",
          "Slider",
          "SwitchGroup",
          "SwitchItem",
          "Chips",
          "ChipItem",
          "OptionCards",
          "OptionCard",
        ],
        code: `root = Stack([form])
form = Form("more", Buttons([Button("Apply", @ToAssistant("Apply"), "primary")]), [budget, notify, tags, tier])
budget = FormControl("Budget", Slider("budget", "continuous", 0, 100, 5, [40]))
notify = FormControl("Notifications", SwitchGroup("notify", [SwitchItem("Email", "Daily digest", "email", true), SwitchItem("Push", "Instant alerts", "push")]))
tags = FormControl("Topics", Chips("topics", "multiple", [ChipItem("ai", "AI"), ChipItem("web", "Web"), ChipItem("design", "Design")]))
tier = FormControl("Tier", OptionCards("tier", "single", [OptionCard("basic", "Basic", "Good start"), OptionCard("team", "Team", "Collaborate")]))`,
      },
    ],
  },
  {
    name: "Buttons & data display (render-only)",
    advertised: false,
    samples: [
      {
        title: "IconButton / Icon",
        components: ["IconButton", "Icon"],
        code: `root = Stack([Buttons([IconButton("like", Icon("heart"), @ToAssistant("Like"), "secondary"), IconButton("share", Icon("share"), @ToAssistant("Share"), "primary", "medium", "circle")])])`,
      },
      {
        title: "Tag / TagBlock",
        components: ["Tag", "TagBlock"],
        code: `root = Stack([TagBlock(["react", "typescript", "vite"]), Stack([Tag("Neutral"), Tag("Info", null, "md", "info"), Tag("Success", null, "md", "success"), Tag("Warning", null, "md", "warning"), Tag("Danger", null, "md", "danger")], "row", "s", "start", "start", true)])`,
      },
      {
        title: "EntityList",
        components: ["EntityList"],
        code: `root = Stack([EntityList([{left: "Subtotal", right: "$120.00", rightVariant: "number"}, {left: "Shipping", right: "$8.00", rightVariant: "number"}], "default", {left: "Item", right: "Amount"}, {left: "Total", right: "$128.00", rightVariant: "number"})])`,
      },
    ],
  },
  {
    name: "Cards (render-only)",
    advertised: false,
    samples: [
      {
        title: "Text primitives",
        components: [
          "Text",
          "BoldText",
          "IconText",
          "ImageText",
          "ImageTextLarge",
          "MetricIndicatorInline",
          "MetricIndicatorWithStrikethrough",
        ],
        code: `root = Stack([Text("text", "Plain text", "subtext"), BoldText("number", "$4,200", "+12%", "metric", "lg"), IconText(Icon("star"), "soft", "md", "Icon text", "with subtitle"), ImageText("${img("flai-avatar", 96, 96)}", "Avatar", "Image text", "subtitle"), ImageTextLarge("${img("flai-cover", 320, 200)}", "Cover", "Image text large", "subtitle"), MetricIndicatorInline("1,234", "users", {direction: "up", value: 8}), MetricIndicatorWithStrikethrough("$49", "per month", "$79", {direction: "down", value: 38})])`,
      },
      {
        title: "SnippetCardBlock",
        components: ["SnippetCardBlock", "SnippetCardItem"],
        code: `root = Stack([SnippetCardBlock([SnippetCardItem("a", IconText(Icon("cpu"), "soft", "md", "CPU"), BoldText("number", "42%")), SnippetCardItem("b", IconText(Icon("database"), "soft", "md", "Memory"), BoldText("number", "6.1 GB"))])])`,
      },
      {
        title: "OverviewCardBlock",
        components: ["OverviewCardBlock", "OverviewCardItem"],
        code: `root = Stack([OverviewCardBlock([OverviewCardItem("a", Text("text", "Revenue", "this month"), MetricIndicatorInline("$12.4k", "", {direction: "up", value: 14})), OverviewCardItem("b", Text("text", "Churn", "this month"), MetricIndicatorInline("2.1%", "", {direction: "down", value: 3}))])])`,
      },
      {
        title: "ContextCardBlock",
        components: ["ContextCardBlock", "ContextCardItem"],
        code: `root = Stack([ContextCardBlock([ContextCardItem("a", "Plain context", "Body text for the card.", "gray"), ContextCardItem("b", Tag("Featured", null, "sm", "info"), "With an image background.", null, "${img("flai-ctx")}", "Background")])])`,
      },
      {
        title: "CompositeCardBlock",
        components: ["CompositeCardBlock", "CompositeCardItem"],
        code: `root = Stack([CompositeCardBlock([item])])
item = CompositeCardItem("a", ImageTextLarge("${img("flai-hotel", 480, 280)}", "Hotel", "Seaside Hotel", "Lisbon"), [TagBlock(["Wi-Fi", "Pool"]), Text("text", "4.8 rating", "1,200 reviews")], {price: MetricIndicatorWithStrikethrough("$129", "per night", "$159"), button: Button("Book", @ToAssistant("Book Seaside Hotel"), "primary")})`,
      },
      {
        title: "VisualCardBlock",
        components: ["VisualCardBlock", "VisualCardItem"],
        code: `root = Stack([VisualCardBlock([VisualCardItem(BoldText("text", "Kyoto", "Japan"), "a", "${img("flai-kyoto", 400, 520)}", Tag("Trending", null, "sm")), VisualCardItem(BoldText("text", "Reykjavík", "Iceland"), "b", "${img("flai-iceland", 400, 520)}")])])`,
      },
    ],
  },
]
