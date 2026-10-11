import { describe, expect, it } from "vitest";
import { cifrarPin, coincidePin, firmar, mismaFirma, pinValido } from "./pin";
import { ROLES, inicioDe, puede } from "./roles";

describe("PIN", () => {
  it("acepta solo 4 números", () => {
    expect(pinValido("0420")).toBe(true);
    expect(pinValido("123")).toBe(false);
    expect(pinValido("12345")).toBe(false);
    expect(pinValido("12a4")).toBe(false);
  });

  it("se guarda cifrado y solo coincide con el PIN correcto", async () => {
    const cifrado = await cifrarPin("4821");
    expect(cifrado).not.toContain("4821");
    expect(await coincidePin("4821", cifrado)).toBe(true);
    expect(await coincidePin("4822", cifrado)).toBe(false);
    expect(await coincidePin("4821", "basura")).toBe(false);
  });

  it("cambiar el PIN invalida la sesión anterior", async () => {
    const antes = firmar("secreto", "corte", await cifrarPin("1111"));
    const despues = firmar("secreto", "corte", await cifrarPin("1111"));
    expect(mismaFirma(antes, antes)).toBe(true);
    expect(mismaFirma(antes, despues)).toBe(false);
  });
});

describe("permisos", () => {
  it("cada área entra solo a su tableta", () => {
    expect(puede("corte", "corte")).toBe(true);
    expect(puede("corte", "confeccion")).toBe(false);
    expect(puede("corte", "ventas")).toBe(false);
    expect(puede("corte", "dashboard")).toBe(false);
  });

  it("ventas registra y decide, gerencia solo mira", () => {
    expect(puede("ventas", "ventas")).toBe(true);
    expect(puede("ventas", "decidir")).toBe(true);
    expect(puede("ventas", "corte")).toBe(false);
    expect(puede("gerencia", "dashboard")).toBe(true);
    expect(puede("gerencia", "decidir")).toBe(false);
    expect(puede("gerencia", "ventas")).toBe(false);
  });

  it("solo el administrador cambia los PIN", () => {
    expect(ROLES.filter((r) => puede(r, "accesos"))).toEqual(["admin"]);
    expect(puede("jefe", "acabados")).toBe(true);
    expect(puede("jefe", "ventas")).toBe(true);
  });

  it("cada rol llega a su pantalla", () => {
    expect(inicioDe("bordado")).toBe("/area/bordado");
    expect(inicioDe("ventas")).toBe("/ventas");
    expect(inicioDe("gerencia")).toBe("/dashboard");
    expect(inicioDe("admin")).toBe("/accesos");
  });
});
