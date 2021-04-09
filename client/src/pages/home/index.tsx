import { useState } from "react";
import { Link } from "react-router-dom";

import "./home.scss";
import PepeHouseLogo from "../../static/images/pepe.png";
import { setConstantValue } from "typescript";

const Home = () => {
  const [roomId, setRoomId] = useState("");
  return (
    <div>
      <div className="header">
        <Link className="header__link" to="/">
          <img
            className="header-image"
            src={PepeHouseLogo}
            alt="PepeHouse Logo"
          />
          <h1 className="title is-2">PepeHouse</h1>
        </Link>
      </div>
      <section className="section home">
        <section className="section">
          <button className="button is-primary is-rounded">
            <Link to="/host" style={{ color: "inherit" }}>
              Create room
            </Link>
          </button>
        </section>
        <section className="section room-input">
          <input
            onChange={(e) => setRoomId(e.target.value)}
            className="input is-rounded"
            type="text"
            placeholder="Enter room id"
          />
          <Link
            to={`/room/${roomId}`}
            className="button is-primary is-rounded join-button"
          >
            Join room
          </Link>
        </section>
      </section>
    </div>
  );
};

export default Home;
