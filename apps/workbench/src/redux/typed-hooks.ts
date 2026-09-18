import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "./store.js";

/**
 * wrap non typed functions with types.
 * removes the need to type `state: RootState` inside useSelector()
 * also helps useDispatch understand typing around thunks if those are ever
 * implemented
 */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
