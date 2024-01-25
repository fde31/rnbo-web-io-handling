class MultiSineProcessor extends AudioWorkletProcessor {

  deltas = [0, 0 , 0, 0];
  prevFreqs = [110, 220, 440, 880];
  
  static paramNames = ["freq_1", "freq_2", "freq_3", "freq_4"];
  static get parameterDescriptors() {
    return this.paramNames.map((name, index) => ({
      name,
      defaultValue: (index + 1) * 110,
      minValue: 0,
      maxValue: 880,
      automationRate: "a-rate"
    }));
  }

	process(_inputs, outputs, parameters) {
    const output = outputs[0];
    output.forEach((channel, channelIndex) => {
      
      const index = channelIndex % (MultiSineProcessor.paramNames.length + 1);
      const param = parameters[MultiSineProcessor.paramNames[index]];

      for (let i = 0; i < channel.length; i++) {
        const freq = param.length > 1 ? param[i] : param[0];
        const globTime = currentTime + i / sampleRate;

        this.deltas[index] += globTime * (this.prevFreqs[index] - freq);
        this.prevFreqs[index] = freq;

        const time = globTime * freq + this.deltas[index];
        channel[i] = Math.sin(2 * Math.PI * time);
      }
    });
		return true;
	}

}

registerProcessor("multi-sine", MultiSineProcessor);