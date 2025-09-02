import app from "./app";

const port = 3000;

// Only start the server if we're not in a serverless environment
if (require.main === module) {
	app.listen(port, () => {
		console.log(`Server is running at http://localhost:${port}`);
	});
}

export default app;
