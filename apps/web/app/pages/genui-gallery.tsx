import { useEffect } from "react"
import { Badge } from "~/components/ui/badge"
import { GenuiBlock } from "~/components/genui/genui-block"
import { sampleGroups } from "~/features/genui-gallery/samples"
import { notify } from "~/lib/notify"

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

const countComponents = (advertised: boolean) =>
  new Set(
    sampleGroups
      .filter((group) => group.advertised === advertised)
      .flatMap((group) => group.samples.flatMap((sample) => sample.components))
      .filter((name) => !name.startsWith("@"))
  ).size

/** Developer page that renders every OpenUI component through the same renderer as chat replies. */
export default function GenuiGalleryPage() {
  useEffect(() => {
    document.title = "FlaiChat - OpenUI gallery"
  }, [])

  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto">
      <nav className="sticky top-0 hidden w-56 shrink-0 self-start p-6 text-sm lg:block">
        <ul className="space-y-1">
          {sampleGroups.map((group) => (
            <li key={group.name}>
              <a
                href={`#${slug(group.name)}`}
                className="block py-1 text-muted-foreground hover:text-foreground"
              >
                {group.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main className="mx-auto w-full max-w-4xl min-w-0 px-4 py-8 md:px-8">
        <header className="mb-10 space-y-2">
          <h1 className="text-3xl font-light tracking-tight">OpenUI gallery</h1>
          <p className="text-sm text-muted-foreground">
            {countComponents(true)} components are advertised in the chat
            prompt; {countComponents(false)} more are render-only (old replies
            still display them). Buttons and form submits show the message they
            would send.
          </p>
        </header>
        {sampleGroups.map((group) => (
          <section
            key={group.name}
            id={slug(group.name)}
            className="mb-14 scroll-mt-6"
          >
            <div className="mb-4 flex items-center gap-2 border-b pb-2">
              <h2 className="text-xl font-light">{group.name}</h2>
              <Badge variant={group.advertised ? "default" : "outline"}>
                {group.advertised ? "advertised" : "render-only"}
              </Badge>
            </div>
            <div className="space-y-10">
              {group.samples.map((sample) => (
                <article key={sample.title} className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="font-medium">{sample.title}</h3>
                    <span className="font-mono text-xs text-muted-foreground">
                      {sample.components.join(" · ")}
                    </span>
                  </div>
                  <GenuiBlock
                    code={sample.code}
                    streaming={false}
                    onSend={(text) => notify.info("Would send", text)}
                  />
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground select-none">
                      Source
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 font-mono">
                      {sample.code}
                    </pre>
                  </details>
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}
