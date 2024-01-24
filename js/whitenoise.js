class WhiteNoiseProcessor extends AudioWorkletProcessor {

	process(_inputs, outputs, _parameters) {
    for (const output of outputs) {

      output.forEach((channel) => {
        for (let i = 0; i < channel.length; i++) {
          channel[i] = Math.random() * 2 - 1;
        }
      });
    }

		return true;
	}

}

registerProcessor("white-noise", WhiteNoiseProcessor);