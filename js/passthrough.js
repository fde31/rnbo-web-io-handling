class InputMergerProcessor extends AudioWorkletProcessor {

	process(inputs, outputs, _parameters) {
    
    // Map Inputs to Channels
    const output = outputs[0];
    const outChannels = output.length;

    for (let channel = 0; channel < outChannels; channel++) {
      if (!inputs[channel] || !inputs[channel].length) {
        continue;
      }

      for (let j = 0; j < inputs[channel][0].length; j++) {
        output[channel][j] = inputs[channel][0][j];
      }
    }

    return true;
	}

}

registerProcessor("passthrough", InputMergerProcessor);