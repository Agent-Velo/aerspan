import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type LoaderData = {
  greeting: string
  name: string
  loadedAt: string
}

export async function loader({ request }: LoaderFunctionArgs): Promise<LoaderData> {
  const url = new URL(request.url)
  const name = url.searchParams.get("name")?.trim() || "world"

  return {
    greeting: `Hello, ${name}!`,
    name,
    loadedAt: new Date().toISOString(),
  }
}

type ActionData =
  | {
      ok: true
      message: string
      receivedAt: string
    }
  | {
      ok: false
      error: string
    }

export async function action({ request }: ActionFunctionArgs): Promise<ActionData> {
  const formData = await request.formData()
  const message = String(formData.get("message") ?? "").trim()

  if (!message) {
    return { ok: false, error: "Message is required." }
  }

  return { ok: true, message, receivedAt: new Date().toISOString() }
}

export function DataDemoRoute() {
  const loaderData = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()

  const isSubmitting = navigation.state === "submitting"

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">React Router Data Mode</h1>
        <p className="text-sm text-muted-foreground">
          这个页面演示了 <code className="font-mono">loader</code> /{" "}
          <code className="font-mono">action</code> /{" "}
          <code className="font-mono">Form</code>。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Loader (GET)</CardTitle>
          <CardDescription>
            提交 GET 表单会更新 URL 的 query，并触发 loader 重新运行。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            <span className="font-medium">Greeting:</span> {loaderData.greeting}
          </div>
          <div className="text-xs text-muted-foreground">
            loadedAt: {loaderData.loadedAt}
          </div>

          <Form method="get" className="flex flex-col gap-2 sm:flex-row">
            <Input
              name="name"
              defaultValue={loaderData.name}
              placeholder="name (query)"
              aria-label="name"
            />
            <Button type="submit" variant="secondary">
              Update query
            </Button>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Action (POST)</CardTitle>
          <CardDescription>
            提交 POST 表单会触发 action，并且默认会 revalidate loader。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Form method="post" className="flex flex-col gap-2 sm:flex-row">
            <Input
              name="message"
              placeholder="message (formData)"
              aria-label="message"
              required
            />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting…" : "Submit"}
            </Button>
          </Form>

          {actionData ? (
            actionData.ok ? (
              <div className="text-sm">
                <span className="font-medium">Server echo:</span>{" "}
                {actionData.message}
                <div className="text-xs text-muted-foreground">
                  receivedAt: {actionData.receivedAt}
                </div>
              </div>
            ) : (
              <div className="text-sm text-destructive">{actionData.error}</div>
            )
          ) : (
            <div className="text-sm text-muted-foreground">
              还没有提交 POST 表单。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

