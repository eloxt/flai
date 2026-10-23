/** A working tool: inputs in $variables, values computed with @functions. */
export const workingToolExample = `root = Stack([title, controls, tbl, total, ask])
$people = 2
$nights = "3"
title = TextContent("Lisbon weekend for " + @Plural($people, "person", "people"), "large-heavy")
controls = Stack([Buttons([Button("−", @Set($people, @Clamp($people - 1, 1, 8)), "secondary"), Button("+", @Set($people, @Clamp($people + 1, 1, 8)), "secondary")]), Input("nights", "Nights", "number", null, $nights)], "row", "m", "center")
nights = @Clamp(@Default($nights * 1, 1), 1, 14)
rows = @Each(items, "i", {name: i.name, cost: i.perNight * nights * (i.shared ? 1 : $people)})
tbl = Table([Col("Item", rows.name), Col("Cost", @Each(rows, "r", @Format(r.cost, "currency", 0, "EUR")))])
total = Callout("info", @Format(@Sum(rows.cost), "currency", 0, "EUR") + " in total", @Format(@Sum(rows.cost) / $people, "currency", 0, "EUR") + " each for " + @Plural(nights, "night"))
ask = Buttons([Button("Plan the days", @ToAssistant("Plan my days in Lisbon", {people: $people, nights: nights}))])
items = [{name: "Hotel", perNight: 140, shared: true}, {name: "Food", perNight: 45, shared: false}, {name: "Transport", perNight: 12, shared: false}]`
