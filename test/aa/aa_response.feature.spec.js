const { Testkit } = require('../../main')
const { Network } = Testkit()
const { bouncingAa, dataFeedAa } = require('./agents')

describe('Check receiving AA response feature', function () {
	this.timeout(120000)

	before(async () => {
		this.network = await Network.create()
		this.genesis = await this.network.getGenesisNode().ready()
		this.deployer = await this.network.newHeadlessWallet().ready()
		this.wallet = await this.network.newHeadlessWallet().ready()

		const deployerAddress = await this.deployer.getAddress()
		const { unit, error } = await this.genesis.sendBytes({ toAddress: deployerAddress, amount: 1e9 })
		expect(error).to.be.null
		expect(unit).to.be.validUnit
		await this.network.witness(2)
	})

	it('Deploy bouncing Agent', async () => {
		const { address: agentAddress, unit: agentUnit, error: deploymentError } = await this.deployer.deployAgent(bouncingAa)
		expect(agentAddress).to.be.validAddress
		expect(agentUnit).to.be.validUnit
		expect(deploymentError).to.be.null

		this.bouncingAgentAddress = agentAddress
		await this.network.witness(2)
	}).timeout(15000)

	it('Deploy data feed Agent', async () => {
		const { address: agentAddress, unit: agentUnit, error: deploymentError } = await this.deployer.deployAgent(dataFeedAa)
		expect(agentAddress).to.be.validAddress
		expect(agentUnit).to.be.validUnit
		expect(deploymentError).to.be.null

		this.dataFeedAgentAddress = agentAddress
		await this.network.witness(2)
	}).timeout(15000)

	it('Send money to wallet', async () => {
		const walletAddress = await this.wallet.getAddress()
		const { unit, error } = await this.genesis.sendBytes({ toAddress: walletAddress, amount: 1e9 })
		expect(error).to.be.null
		expect(unit).to.be.validUnit
		await this.network.witness(2)
	}).timeout(10000)

	it('Trigger bouncing AA not enough fees', async () => {
		const { unit, error } = await this.wallet.sendData({
			toAddress: this.bouncingAgentAddress,
			amount: 100,
			payload: {
				bounceMessage: 'BOUNCED!',
			},
		})

		expect(error).to.be.string('The amounts are less than bounce fees')
		expect(unit).to.be.null

		await this.network.witness(2)
	}).timeout(10000)

	it('Trigger bouncing AA', async () => {
		const { unit, error } = await this.wallet.sendData({
			toAddress: this.bouncingAgentAddress,
			amount: 10000,
			payload: {
				bounceMessage: 'BOUNCED!',
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witness(2)

		const { response } = await this.wallet.getAaResponse({ toUnit: unit })
		expect(response.response.error).to.be.string('Bounce with message BOUNCED!')
	}).timeout(10000)

	it('Trigger data feed AA without data', async () => {
		const { unit, error } = await this.wallet.sendData({
			toAddress: this.dataFeedAgentAddress,
			amount: 10000,
			payload: {
				notDataFeedPayload: '123',
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witness(4)

		const { response: triggerResponse } = await this.wallet.getAaResponse({ toUnit: unit })
		expect(triggerResponse.bounced).to.be.false
		expect(triggerResponse.response.responseVars.dataFeedAaResponse).to.be.string('aa response!')

		const aaResponseUnit = triggerResponse.response_unit
		const { unitObj, error: aaResponseUnitError } = await this.wallet.getUnitInfo({ unit: aaResponseUnit })

		expect(aaResponseUnitError).to.be.null
		const dataFeedMessage = unitObj.unit.messages.find(e => e.app === 'data_feed')
		expect(dataFeedMessage.payload.dataFeedPayload).to.be.string('no datafeed provided')
	}).timeout(20000)

	it('Trigger data feed AA with data', async () => {
		const { unit, error } = await this.wallet.sendData({
			toAddress: this.dataFeedAgentAddress,
			amount: 10000,
			payload: {
				dataFeedPayload: 'this will be a datafeed',
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witness(4)

		const { response: triggerResponse } = await this.wallet.getAaResponse({ toUnit: unit })
		expect(triggerResponse.bounced).to.be.false
		expect(triggerResponse.response.responseVars.dataFeedAaResponse).to.be.string('aa response!')

		const aaResponseUnit = triggerResponse.response_unit
		const { unitObj, error: aaResponseUnitError } = await this.wallet.getUnitInfo({ unit: aaResponseUnit })

		expect(aaResponseUnitError).to.be.null
		const dataFeedMessage = unitObj.unit.messages.find(e => e.app === 'data_feed')
		expect(dataFeedMessage.payload.dataFeedPayload).to.be.string('this will be a datafeed')
	}).timeout(20000)

	after(async () => {
		await this.network.stop()
	})
})
