const path = require('path')
const uniqid = require('uniqid')
const Joi = require('joi')
const config = require('config')

const { getIdForPrefix } = requireRoot('src/utils')
const { HeadlessWallet, GenesisNode, ObyteHub } = requireRoot('src/nodes')

const paramsSchema = () => ({
	runid: Joi.string().required(),
	genesisUnit: Joi.string().required(),
	initialWitness: Joi.string().required(),
	trustedRegistry: Joi.string().required(),
})

class Network {
	constructor (params) {
		const { error, value } = Joi.validate(params, paramsSchema(), {})
		if (error) throw new Error(`${error}`)
		Object.assign(this, value)

		this.rundir = path.join(config.TESTDATA_DIR, this.runid)
	}

	static fromRun (runid) {
		return new Network()
	}

	static async genesis (params) {
		const runid = getIdForPrefix(config.TESTDATA_DIR, 'runid-')
		const rundir = path.join(config.TESTDATA_DIR, runid)

		const genesisNode = new GenesisNode({
			rundir,
			id: 'genesis-node',
			passphrase: config.DEFAULT_PASSPHRASE,
			...params,
		})
		const { genesisUnit, genesisAddress } = await genesisNode.createGenesis()

		const network = new Network({
			runid,
			genesisUnit,
			initialWitness: genesisAddress,
			trustedRegistry: genesisAddress,
		})
		network.genesisNode = genesisNode
		return network
	}

	newHeadlessWallet (params) {
		return new HeadlessWallet({
			rundir: this.rundir,
			genesisUnit: this.genesisUnit,
			id: getIdForPrefix(this.rundir, 'headless-wallet-'),
			passphrase: config.DEFAULT_PASSPHRASE,
			...params,
		})
	}

	newObyteHub (params) {
		return new ObyteHub({
			id: getIdForPrefix(this.rundir, 'obyte-hub-'),
			rundir: this.rundir,
			genesisUnit: this.genesisUnit,
			initialWitness: this.initialWitness,
			trustedRegistry: this.trustedRegistry,
			...params,
		})
	}
}

module.exports = {
	genesis: Network.genesis,
	fromRun: Network.fromRun,
}
