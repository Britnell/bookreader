import Electrobun, { Electroview } from "electrobun/view"
import { useRef, useState } from "react"
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

type RPC = {
	bun: {
		requests: {
			settings: { params: undefined | object; response: Settings }
			selectPath: { params: undefined; response: Settings }
			getBooks: { params: undefined; response: Book[] }
			addBook: { params: undefined; response: object }
			removeBook: { params: string; response: object }
			readBook: { params: string; response: object }
			openBook: { params: string; response: { title: string } }
			getFinishedChapters: { params: string; response: string[] }
			readChapter: { params: string; response: object }
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

const CONCURRENT_READS = 1

function App() {
	const { data: settings, refetch: refetchSettings } = useQuery({
		queryKey: ["settings"],
		queryFn: () => electrobun.rpc?.request.settings(),
	})

	const [openBook, setOpenBook] = useState<Book | null>(null)
	const [readingChapters, setReadingChapters] = useState<string[]>([])
	const shouldReadRef = useRef(false)

	const { data: openBookData } = useQuery({
		queryKey: ["open", openBook?.title],
		queryFn: () =>
			electrobun.rpc?.request.openBook(openBook?.title || "").catch(console.log) || null,
		enabled: !!openBook?.title,
	})

	const { data: finishedChapters } = useQuery({
		queryKey: ["finishedChapters", openBook?.title],
		queryFn: () =>
			electrobun.rpc?.request.getFinishedChapters(openBook?.title || "").catch(console.log) || null,
		enabled: !!openBookData,
	})

	console.log({ settings })
	console.log({ openBook })
	console.log({ finishedChapters })
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

	const startReading = async (book: Book) => {
		const finished = finishedChapters || []
		const unread = book.chapters.filter((ch) => !finished.includes(ch))

		for (let i = 0; i < unread.length; i += CONCURRENT_READS) {
			if (!shouldReadRef.current) break
			const batch = unread.slice(i, i + CONCURRENT_READS)
			setReadingChapters(batch)
			await Promise.all(
				batch.map((ch) =>
					electrobun.rpc?.request.readChapter(ch).catch(console.error),
				),
			)
		}

		shouldReadRef.current = false
		setReadingChapters([])
	}

	const toggleRead = (book: Book) => {
		if (shouldReadRef.current) {
			shouldReadRef.current = false
			setReadingChapters([])
		} else {
			shouldReadRef.current = true
			startReading(book)
		}
	}

	return (
		<div className=" min-h-screen bg-white p-3">
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
							onClick={() => toggleRead(openBook)}
						>
							{readingChapters.length > 0 ? "STOP" : "READ"}
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
							<li key={i}>
								{ch}
								{readingChapters.includes(ch) && (
									<span className="ml-2 text-blue-500">[reading]</span>
								)}
								{finishedChapters?.includes(ch) && (
									<span className="ml-2 text-green-500">[done]</span>
								)}
							</li>
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
