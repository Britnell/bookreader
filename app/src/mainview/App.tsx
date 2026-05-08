import Electrobun, { Electroview } from "electrobun/view"
import {
	useQuery,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query"

const queryClient = new QueryClient()

type Settings = {
	path?: string
}

type RPC = {
	bun: {
		requests: {
			settings: { params: undefined | object; response: Settings }
			selectPath: { params: undefined; response: Settings }
			selectBook: { params: undefined; response: string }
		}
		messages: {}
	}
	webview: {
		requests: {}
		messages: {}
	}
}

const rpc = Electroview.defineRPC<RPC>({
	maxRequestTime: 3600000,
	handlers: {
		requests: {},
		messages: {},
	},
})

const electrobun = new Electrobun.Electroview({ rpc })

function App() {
	const { data: settings, refetch: refetchSettings } = useQuery({
		queryKey: ["settings"],
		queryFn: () => electrobun.rpc?.request.settings(),
	})

	const selectPath = async () => {
		await electrobun.rpc?.request.selectPath()
		refetchSettings()
	}

	const selectBook = async () => {
		const result = await electrobun.rpc?.request.selectBook()
		console.log("selected book:", result)
	}

	return (
		<div className="min-h-screen bg-white p-3">
			<h1>App</h1>

			<div className="flex">
				<p>select / change folder for your books: </p>
				<button className="bg-gray-200 px-1" onClick={selectPath}>
					select
				</button>
			</div>
			<div>
				<button onClick={selectBook} className="border size-20">
					Select EPUB
				</button>
			</div>
		</div>
	)
}

function Root() {
	return (
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>
	)
}

export default Root
