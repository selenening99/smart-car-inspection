export function postprocess(output: any) {
  const tensor = output.output0;

  console.log("dims:", tensor.dims);

  const data = tensor.cpuData as Float32Array;

  console.log("===== Prediction 0 =====");

  for (let j = 0; j < 6; j++) {
    console.log(
      `channel ${j}:`,
      data[j * 8400]
    );
  }

  return [];
}