import {Quaternion} from "../types/ros.ts";
import {Converter} from 'usng.js'

// @ts-ignore
var converter = new Converter();
export const earth = 6371008.8;  //radius of the earth in kilometer
export const pi = Math.PI;
export const meterInDegree = (1 / ((2 * pi / 360) * earth));  //1 meter in degree

export function getQuaternionFromHeading(heading: number): Quaternion {
    const q = {
        X: 0,
        Y: 0,
        Z: 0,
        W: 0,
    } as Quaternion
    q.W = Math.cos(heading / 2)
    q.Z = Math.sin(heading / 2)
    return q
}

export function drawLine(longitude: number, latitude: number, orientation: number, length: number): [number, number] {
    const endLongitude = longitude + Math.cos(orientation) * length;
    const endLatitude = latitude + Math.sin(orientation) * length;

    return [endLongitude, endLatitude];
}

export const transpose = (datumLon: number, datumLat: number, y: number, x: number) => {
    const coords: [number, number, number] = [0, 0, 0]
    debugger
    converter.LLtoUTM(datumLat, datumLon, coords)
    coords[0] += x
    coords[1] += y
    let utMtoLL = converter.UTMtoLL(coords[1], coords[0], coords[2]);
    return [utMtoLL.lon, utMtoLL.lat]
};
export const itranspose = (datumLon: number, datumLat: number, y: number, x: number) => {
    //Inverse the transpose function
    const coords: [number, number, number] = [0, 0, 0]
    converter.LLtoUTM(y - datumLat, x - datumLon, coords)
    return [coords[0], coords[1]]
};