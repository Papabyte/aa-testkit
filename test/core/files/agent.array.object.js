module.exports = [
	'autonomous agent',
	{
		bounce_fees: { base: 500000 },
		messages: [
			{
				app: 'payment',
				payload: {
					asset: 'base',
					outputs: [
						{ address: '{trigger.address}', amount: '{trigger.output[[asset=base]] - 1000}' },
					],
				},
			},
		],
	},
]
