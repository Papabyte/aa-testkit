const { asyncStartHeadlessWalletsWithMnemonics, generateMnemonic, getFirstAddress } = require('../../utils')

class NetworkInitializer {
	constructor ({ network }) {
		this.network = network

		this.assets = {}
		this.agents = {}
		this.wallets = {}
		this.deployer = null
		this.obyteExplorer = null

		this.initializer = {
			wallets: {},
			assets: {},
			agents: {},
			deployer: null,
			explorer: null,
			numberOfWitnesses: 2, // 3, but first witness is genesis node
			needDeployer: false,
			witnesses: [],
		}

		this.isInitialized = false
	}

	async prepareWitnesses () {
		for (let i = 0; i < this.initializer.numberOfWitnesses; i++) {
			const mnemonic = generateMnemonic()
			const address = getFirstAddress(mnemonic)

			this.initializer.witnesses.push({
				mnemonic,
				address,
			})
		}
	}

	async prepareGenesisData () {
		const transfers = []

		for (const name in this.initializer.wallets) {
			const w = this.initializer.wallets[name]
			if (w.balances.base && w.balances.base > 0) {
				transfers.push({
					address: w.address,
					amount: w.balances.base,
				})
			}
		}

		for (const witness of this.initializer.witnesses) {
			transfers.push({
				address: witness.address,
				amount: 1e10,
			})
		}

		if (this.initializer.needDeployer) {
			const mnemonic = generateMnemonic()
			const address = getFirstAddress(mnemonic)

			this.initializer.deployer = {
				address,
				mnemonic,
			}

			transfers.push({
				address: address,
				amount: 1e10,
			})
		}

		return {
			witnesses: this.initializer.witnesses,
			transfers,
		}
	}

	async initialize ({ wallets, agents, deployer, assets, explorer } = {}) {
		await this.network.genesisNode.ready()

		if (explorer) await this.initializeExplorer(explorer)

		const mnemonics = Object.keys(wallets).map(name => wallets[name].mnemonic)
		if (deployer) mnemonics.push(deployer.mnemonic)

		const walletNodes = await asyncStartHeadlessWalletsWithMnemonics(this.network, mnemonics)

		await this.network.witnessAndStabilize()
		await this.network.witnessAndStabilize()

		if (deployer) this.deployer = walletNodes.pop()

		for (const walletName in wallets) {
			this.wallets[walletName] = walletNodes.shift()
		}

		await this.initializeAssets(assets)
		await this.initializeAgents(agents)
		const units = await this.initializeAssetBalances(wallets)

		for (const unit of units) {
			await this.network.witnessUntilStable(unit)
		}

		this.isInitialized = true
	}

	async initializeAssets (assets = {}) {
		for (const name in assets) {
			const { unit, error } = await this.deployer.createAsset(assets[name])
			if (error) throw new Error(error)
			this.assets[name] = unit
			await this.network.witnessUntilStable(unit)
		}
	}

	async initializeAgents (agents = {}) {
		for (const name in agents) {
			const { address, unit, error } = await this.deployer.deployAgent(agents[name])
			if (error) throw new Error(error)
			this.agents[name] = address
			await this.network.witnessUntilStable(unit)
		}
	}

	async initializeAssetBalances (wallets = {}) {
		const walletsWithAddresses = await Promise.all(Object.keys(wallets).map(async name => {
			const address = await this.wallets[name].getAddress()

			return {
				name,
				address,
				balances: wallets[name].balances,
			}
		}))

		const outputsMap = walletsWithAddresses.reduce((acc, cur) => {
			for (const asset in cur.balances) {
				const entry = { address: cur.address, amount: cur.balances[asset] }
				acc[asset] = acc[asset]
					? [...acc[asset], entry]
					: [entry]
			}
			return acc
		}, {})

		return Promise.all(Object.keys(outputsMap).map(async asset => {
			if (asset === 'base') {
				return null
			} else {
				if (!this.assets[asset]) throw new Error(`No such asset with name '${asset}'`)

				const { error, unit } = await this.deployer.sendMulti({
					asset_outputs: outputsMap[asset],
					change_address: await this.deployer.getAddress(),
					asset: this.assets[asset],
				})

				if (error) throw new Error(`Error sending asset ${asset} to wallets: ${error}`)
				return unit
			}
		}))
	}

	async initializeExplorer (explorer = {}) {
		this.obyteExplorer = await this.network.newObyteExplorer({ webPort: explorer.port })
		return this.obyteExplorer.ready()
	}

	get with () {
		return this
	}

	explorer ({ port } = {}) {
		this.initializer.explorer = {
			port,
		}
		return this
	}

	wallet (wallet) {
		const name = Object.keys(wallet)[0]
		const balances = typeof wallet[name] === 'object'
			? wallet[name]
			: { base: wallet[name] }

		const mnemonic = generateMnemonic()
		const address = getFirstAddress(mnemonic)

		this.initializer.wallets[name] = {
			address,
			mnemonic,
			balances,
		}
		return this
	}

	agent (agent) {
		const name = Object.keys(agent)[0]
		this.initializer.agents[name] = agent[name]
		this.initializer.needDeployer = true
		return this
	}

	asset (asset) {
		const defaults = {
			is_private: false,
			is_transferrable: true,
			auto_destroy: false,
			issued_by_definer_only: true,
			cosigned_by_definer: false,
			spender_attested: false,
			fixed_denominations: false,
		}

		const name = Object.keys(asset)[0]
		this.initializer.assets[name] = Object.assign({}, defaults, asset[name])
		this.initializer.needDeployer = true
		return this
	}

	numberOfWitnesses (number) {
		this.initializer.numberOfWitnesses = number - 1 // one of the witnesses is genesis node
		return this
	}

	async run () {
		await this.prepareWitnesses()
		const { witnesses, transfers } = await this.prepareGenesisData()
		await this.network.run({ witnesses, transfers })

		try {
			await this.initialize(this.initializer)
			return this.network
		} catch (e) {
			await this.network.stop()
			throw e
		}
	}
}

module.exports = NetworkInitializer
