export function timeout(time: number) {
	return new Promise((resolve) => setTimeout(resolve, time));
}
