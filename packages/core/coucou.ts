const endpoint = 'http://localhost:2222';

const response = await fetch(endpoint + '/test', {
	method: 'POST',
	body: JSON.stringify({
		test: 'coucou',
	}),
}).then((res) => res.json());

console.log({ response });
