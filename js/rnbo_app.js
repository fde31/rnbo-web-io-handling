function showError(message, err) {
	if (!err) return;
	
	const container = document.getElementById("error-display");
	
	const errorDisplay = document.createElement("p");
	errorDisplay.innerText = message;

	const br = document.createElement("br");
	errorDisplay.appendChild(br);

	const hint = document.createElement("i");
	hint.innerText = "See the console for more details.";

	errorDisplay.appendChild(hint);

	container.appendChild(errorDisplay);
	container.style.display = "block";

	console.error(err);
}

async function loadDevice(url, context) {
	const response = await fetch(url);
	const patcher = await response.json();
	return await RNBO.createDevice({ patcher, context });
}

function createNodeInfo(node, title) {
	const info = document.createElement("div");
	const header = document.createElement("h3");
	header.innerText = title;
	info.appendChild(header);

	const data = [
		["node.numberOfInputs", node.numberOfInputs],
		["node.numberOfOutputs", node.numberOfOutputs],
		["node.channelCount", node.channelCount]
	];
	for (const [label, value] of data) {
		const infoRow = document.createElement("div");
		
		const infoLabel = document.createElement("label");
		infoLabel.innerText = label;
		infoRow.appendChild(infoLabel);

		const infoValue = document.createElement("input");
		infoValue.type = "text";
		infoValue.value = value;
		infoValue.disabled = true;
		infoRow.appendChild(infoValue);
		info.appendChild(infoRow);
	}

	return info;
}


function createDeviceInfo(device, title) {
	const info = document.createElement("div");
	const header = document.createElement("h3");
	header.innerText = title;
	info.appendChild(header);
	const data = [
		["device.numInputChannels", device.numInputChannels],
		["device.numOutputChannels", device.numOutputChannels],
		["device.node.numberOfInputs", device.node.numberOfInputs],
		["device.node.numberOfOutputs", device.node.numberOfOutputs],
		["device.node.channelCount", device.node.channelCount]
	];
	for (const [label, value] of data) {
		const infoRow = document.createElement("div");
		
		const infoLabel = document.createElement("label");
		infoLabel.innerText = label;
		infoRow.appendChild(infoLabel);

		const infoValue = document.createElement("input");
		infoValue.type = "text";
		infoValue.value = value;
		infoValue.disabled = true;
		infoRow.appendChild(infoValue);
		info.appendChild(infoRow);
	}

	return info;
}

function createOutputSelect(name, channelCount, defaultValue, onChange) {
	const wrap = document.createElement("div");
	
	const label = document.createElement("label");
	label.innerText = `${name} Output Channel`;
	wrap.appendChild(label);

	const select = document.createElement("select");
	select.name = name;
	for (let i = 0; i < channelCount; i++) {
		const option = document.createElement("option");
		option.value = i;
		option.innerText = `Channel ${i + 1}`;
		select.appendChild(option)
	}

	select.onchange = onChange;
	select.value = defaultValue;
	select.dispatchEvent(new Event("change"));

	wrap.appendChild(select);
	return wrap;
}

function gainToDb(g) {
	return 20 * (Math.log(g) / Math.LN10);
}

function scale(v, inMin, inMax, outMin, outMax) {
	return ((v - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin
}

async function main () {

	
	const WAContext = window.AudioContext || window.webkitAudioContext;
	const context = new WAContext();

	// Set to the maximum amount of channels available
	context.destination.channelCount = context.destination.maxChannelCount;
	context.destination.channelCountMode = "explicit";
	context.destination.channelInterpretation = "discrete";

	let cycleWorklet, passthroughDevice;
	try {
		passthroughDevice = await loadDevice("/export/passthrough.export.json", context);
		await context.audioWorklet.addModule("/js/multisine.js?check=10");
    cycleWorklet = new AudioWorkletNode(
      context,
      "multi-sine",
      {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [passthroughDevice.numInputChannels]
      }
    );
	} catch (err) {
		return showError("Failed to create device from exported patcher", err);
	}

	// Display info
	const infoSection = document.getElementById("io-info-display");
	infoSection.appendChild(createNodeInfo(cycleWorklet, "cycles"));
	infoSection.appendChild(createDeviceInfo(passthroughDevice, "passthrough"));

	// Set Up Parameters for per-channel gain control
	const sliderSection = document.getElementById("sliders");
	const params = passthroughDevice.parameters;
	for (const param of params) {
		
		const paramEl = document.createElement("div");

		const label = document.createElement("label");
		label.innerText = `${param.name} Gain`;
		label.setAttribute("for", param.id);
		paramEl.appendChild(label);
		
		const slider = document.createElement("input");
		slider.type = "range";
		slider.name = param.id;
		slider.min = 0;
		slider.max = 1;
		slider.step = 0.01;
		slider.value = param.normalizedValue;
		slider.oninput = (e) => {
			param.normalizedValue = parseFloat(e.target.value);
		};

		paramEl.appendChild(slider);
		sliderSection.appendChild(paramEl);
	}

	// Context Resume Handler
	document.querySelector("#resume").onclick = () => context.state === "suspended" && context.resume();

	cycleWorklet.connect(passthroughDevice.node);

	// Run Peak Volume Analyser using a channel splitter and draw some very simple meters per-channel
	const channelSplitter = context.createChannelSplitter(passthroughDevice.numOutputChannels);
	passthroughDevice.node.connect(channelSplitter);

	const fftSize = 2048;
	const analysers = [];
	const meterContainer = document.getElementById("meter");
	
	for (let i = 0; i < passthroughDevice.numOutputChannels; i++) {
		
		// Set up Analyser
		const analyser = context.createAnalyser();
		analyser.fftSize = fftSize;
		channelSplitter.connect(analyser, i);

		// Set Up Channel Meter
		const meter = document.createElement("div");
		meter.classList.add("channel-meter");
		meterContainer.appendChild(meter);

		analysers.push({ analyser, buffer: new Float32Array(fftSize), meter });
	}

	function loop() {

		for (const { analyser, buffer, meter } of analysers) {
			analyser.getFloatTimeDomainData(buffer);
			const totalSquared = buffer.reduce((total, current) => total + current * current, 0);
			const rms = Math.sqrt(totalSquared / buffer.length);
			const clip = Math.abs(scale(gainToDb(rms), -64, 0, -100, 0));
			meter.style["clip-path"] = `inset(${clip}% 0px 0px)`;
		}

		requestAnimationFrame(loop);
	}

	// Final Stereo Output Node with channel select
	const outputMerger = context.createChannelMerger(2);
	outputMerger.connect(context.destination);

	const options = [];
	for (let i = 0; i < passthroughDevice.numOutputChannels; i++) {
		const option = document.createElement("option");
		option.value = i;
		option.innerText = `Channel ${i}`;
		options.push(option);
	}


	let currentChannelLeft = null;
	let currentChannelRight = null;
	
	const onOutputSelect = (e) => {
		const channel = parseInt(e.target.value, 10);
		if (isNaN(channel)) return;

		if (e.target.name === "left") {
			if (currentChannelLeft !== null) channelSplitter.disconnect(outputMerger, currentChannelLeft, 0);
			channelSplitter.connect(outputMerger, channel, 0);
			currentChannelLeft = channel;
		} else {
			if (currentChannelRight !== null) channelSplitter.disconnect(outputMerger, currentChannelRight, 1);
			channelSplitter.connect(outputMerger, channel, 1);
			currentChannelRight = channel;
		}
	}

	const leftChannelSelect = createOutputSelect("left", passthroughDevice.numOutputChannels, 0, onOutputSelect);
	const rightChannelSelect = createOutputSelect("right", passthroughDevice.numOutputChannels, 1, onOutputSelect);

	const outputWrap = document.getElementById("output-select");
	outputWrap.appendChild(leftChannelSelect);
	outputWrap.appendChild(rightChannelSelect);


	loop();


};

main();