import { AsciiMediaCanvas } from "../../components/AsciiMediaCanvas";

export function CleanStage() {
  return (
    <div className="relative h-screen w-full bg-black overflow-hidden">
      <AsciiMediaCanvas
        renderMode="particles"
        particleSize={8.5}
        particleStyle="dots"
        aspectFit="contain"
        colorMode="color"
        showPattern={true}
        label="Pointillist particle field stage"
      />
    </div>
  );
}
