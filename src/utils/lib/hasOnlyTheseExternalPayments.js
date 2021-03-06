const hasOnlyTheseExternalPayments = (objUnit, arrExpectedOutputs) => {
	const aaAddress = objUnit.authors[0].address

	// we filter payment messages
	const paymentMessages = objUnit.messages.filter(m => m.app === 'payment')

	const assocExpectedOutputsByAsset = paymentMessages.map(m => m.payload).reduce((acc, cur) => {
		const asset = cur.asset || 'base'
		return asset in acc
			? acc
			: {
				...acc,
				[asset]: [],
			}
	}, {})

	// we sort expected payments by unit
	arrExpectedOutputs.forEach(expectedOutput => {
		const asset = !expectedOutput.asset || expectedOutput.asset === 'base'
			? 'base'
			: expectedOutput.asset
		if (!assocExpectedOutputsByAsset[asset]) { assocExpectedOutputsByAsset[asset] = [] }
		assocExpectedOutputsByAsset[asset].push(expectedOutput)
	})

	// we check that for each asset, expected outputs and actual outputs match
	for (const asset in assocExpectedOutputsByAsset) {
		const paymentMessageForThisAsset = asset === 'base'
			? paymentMessages.find(m => m.payload.asset === undefined)
			: paymentMessages.find(m => m.payload.asset === asset)
		if (!paymentMessageForThisAsset) { return false }
		const outputsForThisAsset = paymentMessageForThisAsset.payload.outputs.filter(o => o.address !== aaAddress) // we exclude change outputs
		const expectedOutputsForThisAsset = assocExpectedOutputsByAsset[asset]

		if (outputsForThisAsset.length !== expectedOutputsForThisAsset.length) { return false }

		for (let i = 0; i < outputsForThisAsset.length; i++) {
			expectedOutputsForThisAsset.forEach((expectedOutput, index) => {
				if (expectedOutput.address === outputsForThisAsset[i].address && expectedOutput.amount === outputsForThisAsset[i].amount) {
					return expectedOutputsForThisAsset.splice(index, 1)
				}
			})
		}
		// if expected output is missing
		if (expectedOutputsForThisAsset.length > 0) { return false }
	}
	return true
}

module.exports = hasOnlyTheseExternalPayments
