import Electrobun, { Electroview } from "electrobun/view"
import { useEffect, useState } from "react"
import {
	QueryClient,
	QueryClientProvider,
	useQuery,
} from "@tanstack/react-query"

const queryClient = new QueryClient()

type Settings = {
	path?: string
	books: Book[]
}

type Book = {
	title: string
	cover?: string
	chapters: string[]
}

type OpenBookResult = {
	title: string
	chapters: string[]
}

type RPC = {
	bun: {
		requests: {
			settings: { params: undefined | object; response: Settings }
			selectPath: { params: undefined; response: Settings }
			getBooks: { params: undefined; response: Book[] }
			addBook: { params: undefined; response: object }
			removeBook: { params: string; response: object }
			readBook: { params: string; response: object }
			openBook: { params: string; response: object }
		}
		messages: {}
	}
	webview: {
		requests: {}
		messages: {}
	}
}

const rpc = Electroview.defineRPC<RPC>({
	maxRequestTime: 30000,
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

	const [openBook, setOpenBook] = useState<Book | null>(null)

	const { data } = useQuery({
		queryKey: ["open", openBook?.title],
		queryFn: async () => {
			console.log("open")
			return (
				electrobun.rpc?.request
					.openBook(openBook?.title || "")
					.catch(console.log) || []
			)
		},
		enabled: !!openBook?.title,
	})

	console.log({ settings })
	console.log({ openBook })
	console.log({ data })
	// const { data: books, refetch: refetchBooks } = useQuery({
	// 	queryKey: ["books"],
	// 	queryFn: () => electrobun.rpc?.request.getBooks(),
	// })

	const selectPath = async () => {
		await electrobun.rpc?.request.selectPath()
		refetchSettings()
		// resp && setSettings(resp)
		// await refetchBooks()
	}

	const addBook = async () => {
		await electrobun.rpc?.request.addBook()
		refetchSettings()
	}

	const removeBook = async (book: Book) => {
		await electrobun.rpc?.request.removeBook(book.title)
		refetchSettings()
		setOpenBook(null)
	}

	const readBook = async (book: Book) => {
		await electrobun.rpc?.request.readBook(book.title)
	}

	return (
		<div className=" min-h-screen bg-white">
			<h1 className="x">App</h1>

			{!openBook && (
				<>
					<div className="flex ">
						<p className="">select / change folder for your books: </p>
						<button className="bg-gray-200 px-1" onClick={selectPath}>
							select
						</button>
					</div>
					<div className="x">
						<button onClick={() => addBook()} className="border size-20">
							Add new book
						</button>
					</div>
					<p className="x">Your books: </p>
					<ul className=" list-disc ml-4">
						{settings?.books?.map((book) => (
							<li key={book.title}>
								<button onClick={() => setOpenBook(book)}>{book.title}</button>
							</li>
						))}
					</ul>
				</>
			)}

			{openBook && (
				<div>
					<div className="flex gap-3">
						<button
							className=" px-1 bg-blue-100 mr-auto"
							onClick={() => readBook(openBook)}
						>
							READ
						</button>
						<button
							className=" px-1 bg-blue-100"
							onClick={() => setOpenBook(null)}
						>
							close
						</button>
						<button
							className=" px-1 bg-blue-100"
							onClick={() => removeBook(openBook)}
						>
							remove
						</button>
					</div>

					<h2>{openBook.title}</h2>
					<ul className="list-disc ml-4">
						{openBook?.chapters?.map((ch, i) => (
							<li key={i}>{ch}</li>
						))}
					</ul>
				</div>
			)}
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
