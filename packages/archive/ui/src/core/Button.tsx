import { useController } from "../context/ControllerContext.js";

export function Button() {
  const controller = useController();

  const handleClick = () => {
    controller.startRuntime();
  };

  return (
    <div>
      <button onClick={handleClick}>Hello</button>
    </div>
  );
}
